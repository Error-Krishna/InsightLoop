import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { getCollection } from '../src/db/mongo.js';

describe('Multi-Tenant Data Isolation Sweep Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('verifies 100% data isolation: Tenant B cannot access, read, mutate, or delete Tenant A resources', async () => {
    // 1. Setup Tenant A and Tenant B
    const tenantA = await createTestUser({ email: 'tenant_a@example.com' });
    const tenantB = await createTestUser({ email: 'tenant_b@example.com' });

    expect(tenantA.companyId).not.toBe(tenantB.companyId);

    // 2. Seed Tenant A resources in database
    const billId = new ObjectId();
    await getCollection('bills').insertOne({
      _id: billId,
      company_id: tenantA.companyId,
      bill_type: 'pakka',
      invoice_number: 'INV-2026-00001',
      buyer: { name: 'Tenant A Secret Client' },
      products: [{ name: 'Top Secret Product', quantity: 10, rate: 500 }],
      grand_total: 5000,
      created_at: new Date(),
    });

    const inventoryId = new ObjectId();
    await getCollection('inventory_items').insertOne({
      _id: inventoryId,
      company_id: tenantA.companyId,
      name: 'Tenant A Raw Material',
      type: 'finished',
      quantity: 100,
      created_at: new Date(),
    });

    const warehouseId = new ObjectId();
    await getCollection('warehouses').insertOne({
      _id: warehouseId,
      company_id: tenantA.companyId,
      name: 'Tenant A Warehouse',
      created_at: new Date(),
    });

    const workerId = new ObjectId();
    await getCollection('workers').insertOne({
      _id: workerId,
      company_id: tenantA.companyId,
      name: 'Tenant A Worker',
      created_at: new Date(),
    });

    const assignmentId = new ObjectId();
    await getCollection('material_assignments').insertOne({
      _id: assignmentId,
      company_id: tenantA.companyId,
      worker_id: workerId.toString(),
      worker: { _id: workerId, name: 'Tenant A Worker' },
      material_name: 'Tenant A Secret Yarn',
      quantity: 50,
      price_per_unit: 10,
      status: 'open',
      created_at: new Date(),
    });

    const paymentId = new ObjectId();
    await getCollection('pay_records').insertOne({
      _id: paymentId,
      company_id: tenantA.companyId,
      worker_id: workerId.toString(),
      product_name: 'Tenant A Finished Batch',
      units_produced: 10,
      rate_per_unit: 20,
      amount_paid: 0,
      paid: false,
      created_at: new Date(),
    });

    // 3. Sweep across all single-resource endpoints using Tenant B's credentials
    const targetedEndpoints = [
      // Bills
      { method: 'get', path: `/api/v1/bills/${billId.toString()}` },
      { method: 'put', path: `/api/v1/bills/${billId.toString()}`, body: { buyer: { name: 'Hacked' } } },
      { method: 'delete', path: `/api/v1/bills/${billId.toString()}` },
      { method: 'post', path: `/api/v1/bills/${billId.toString()}/convert`, body: { gst_number: '29ABCDE1234F1Z5' } },
      { method: 'post', path: `/api/v1/bills/${billId.toString()}/record-payment`, body: { amount: 100 } },
      { method: 'get', path: `/api/v1/bills/${billId.toString()}/profit-preview` },
      { method: 'post', path: `/api/v1/bills/${billId.toString()}/confirm-profit`, body: { confirmed_amount: 100 } },
      { method: 'post', path: `/api/v1/bills/${billId.toString()}/reopen-profit` },
      { method: 'post', path: `/api/v1/bills/${billId.toString()}/transportation-cost`, body: { amount: 50 } },
      { method: 'post', path: `/api/v1/bills/${billId.toString()}/misc-cost`, body: { amount: 50 } },

      // Inventory
      { method: 'get', path: `/api/v1/inventory/finished/${inventoryId.toString()}` },
      { method: 'put', path: `/api/v1/inventory/finished/${inventoryId.toString()}`, body: { name: 'Hacked' } },
      { method: 'delete', path: `/api/v1/inventory/finished/${inventoryId.toString()}` },
      { method: 'get', path: `/api/v1/inventory/warehouses/${warehouseId.toString()}` },
      { method: 'put', path: `/api/v1/inventory/warehouses/${warehouseId.toString()}`, body: { name: 'Hacked' } },
      { method: 'delete', path: `/api/v1/inventory/warehouses/${warehouseId.toString()}` },

      // Workers
      { method: 'get', path: `/api/v1/workers/${workerId.toString()}` },
      { method: 'put', path: `/api/v1/workers/${workerId.toString()}`, body: { name: 'Hacked' } },
      { method: 'delete', path: `/api/v1/workers/${workerId.toString()}` },
      { method: 'get', path: `/api/v1/workers/${workerId.toString()}/materials` },
      { method: 'get', path: `/api/v1/workers/${workerId.toString()}/payments` },
      { method: 'post', path: `/api/v1/workers/materials/${assignmentId.toString()}/batches`, body: { quantity: 10 } },
      { method: 'put', path: `/api/v1/workers/materials/${assignmentId.toString()}/complete` },
      { method: 'put', path: `/api/v1/workers/payments/${paymentId.toString()}/mark-paid` },
      { method: 'post', path: `/api/v1/workers/payments/${paymentId.toString()}/record-payment`, body: { amount: 50 } },
    ] as const;

    for (const ep of targetedEndpoints) {
      let req;
      if (ep.method === 'get') {
        req = request(app).get(ep.path);
      } else if (ep.method === 'put') {
        req = request(app).put(ep.path).send((ep as { body?: unknown }).body ?? {});
      } else if (ep.method === 'post') {
        req = request(app).post(ep.path).send((ep as { body?: unknown }).body ?? {});
      } else {
        req = request(app).delete(ep.path);
      }

      const res = await req.set('Authorization', `Bearer ${tenantB.token}`);

      // Must strictly return 404 (Not Found) or 403 (Forbidden)
      if (![403, 404].includes(res.status)) {
        console.error('TENANCY VIOLATION ON:', ep.method, ep.path, 'STATUS:', res.status, 'BODY:', res.body);
      }
      expect([403, 404]).toContain(res.status);
    }

    // 4. Sweep collection listing endpoints for Tenant B - must NEVER contain Tenant A data
    const listEndpoints = [
      '/api/v1/bills/',
      '/api/v1/inventory/finished/',
      '/api/v1/inventory/semi-finished/',
      '/api/v1/inventory/raw/',
      '/api/v1/inventory/warehouses/',
      '/api/v1/workers/',
      '/api/v1/dashboard/summary/',
      '/api/v1/dashboard/overview/',
      '/api/v1/dashboard/workers/',
      '/api/v1/insights/',
    ];

    for (const path of listEndpoints) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${tenantB.token}`);

      if (res.status !== 200) {
        console.error('LIST ENDPOINT FAILED:', path, res.status, res.body);
      }
      expect(res.status).toBe(200);

      // Verify no Tenant A IDs or names leak into Tenant B response
      const jsonString = JSON.stringify(res.body);
      expect(jsonString).not.toContain(tenantA.companyId);
      expect(jsonString).not.toContain('Top Secret Product');
      expect(jsonString).not.toContain('Tenant A Raw Material');
      expect(jsonString).not.toContain('Tenant A Warehouse');
      expect(jsonString).not.toContain('Tenant A Worker');
    }
  });
});
