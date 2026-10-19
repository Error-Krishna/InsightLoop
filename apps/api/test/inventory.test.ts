import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';

describe('Inventory Module Integration Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('manages warehouses and warehouse summary metadata', async () => {
    const user = await createTestUser();

    // 1. Create Warehouse
    const whRes = await request(app)
      .post('/api/v1/inventory/warehouses')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Central Hub',
        location: 'Sector 5, Gurgaon',
        capacity: 10000,
      });

    expect(whRes.status).toBe(201);
    expect(whRes.body.name).toBe('Central Hub');
    const whId = whRes.body.id as string;

    // 2. List Warehouses
    const listWhRes = await request(app)
      .get('/api/v1/inventory/warehouses')
      .set('Authorization', `Bearer ${user.token}`);

    expect(listWhRes.status).toBe(200);
    expect(listWhRes.body).toHaveLength(1);

    // 3. Update Warehouse
    const updateWhRes = await request(app)
      .put(`/api/v1/inventory/warehouses/${whId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Central Hub North',
      });

    expect(updateWhRes.status).toBe(200);
    expect(updateWhRes.body.name).toBe('Central Hub North');

    // 3b. Create a raw item linked to this warehouse
    await request(app)
      .post('/api/v1/inventory/raw')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Warehouse Stocked Raw Item',
        unit: 'pcs',
        quantity: 25,
        cost_price: 100,
        warehouse_id: whId,
      });

    // 4. Warehouse Summary
    const summaryRes = await request(app)
      .get('/api/v1/inventory/meta/warehouse-summary')
      .set('Authorization', `Bearer ${user.token}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body).toBeDefined();

    // 5. Delete Warehouse
    const delWhRes = await request(app)
      .delete(`/api/v1/inventory/warehouses/${whId}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(delWhRes.status).toBe(204);
  });

  it('manages finished, semi-finished, and raw inventory items with live stats', async () => {
    const user = await createTestUser();

    // 1. Create Raw Material
    const rawRes = await request(app)
      .post('/api/v1/inventory/raw')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Cotton Yarn Spool',
        unit: 'kg',
        quantity: 200,
        cost_price: 80,
      });

    expect(rawRes.status).toBe(201);
    expect(rawRes.body.name).toBe('Cotton Yarn Spool');
    expect(rawRes.body.sku).toBeDefined();
    const rawId = rawRes.body.id as string;

    // 2. Update Raw Material
    const updateRawRes = await request(app)
      .put(`/api/v1/inventory/raw/${rawId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        quantity: 250,
      });

    expect(updateRawRes.status).toBe(200);
    expect(updateRawRes.body.quantity).toBe(250);

    // 3. List Raw
    const listRawRes = await request(app)
      .get('/api/v1/inventory/raw')
      .set('Authorization', `Bearer ${user.token}`);

    expect(listRawRes.status).toBe(200);
    expect(listRawRes.body.length).toBeGreaterThanOrEqual(1);

    // 4. Create worker and bill, then assign to create finished good via production
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Prod Worker', phone: '9988776655' });
    expect(workerRes.status).toBe(201);
    const workerId = workerRes.body.id;

    const billRes = await request(app)
      .post('/api/v1/bills/kacha')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        buyer: { name: 'Direct Buyer' },
        products: [{ name: 'Classic White Shirt', quantity: 50, rate: 500, unit: 'pcs' }],
      });
    expect(billRes.status).toBe(201);
    const billId = billRes.body.id;

    const assignRes = await request(app)
      .post(`/api/v1/workers/${workerId}/materials`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        bill_id: billId,
        material_name: 'Classic White Shirt',
        quantity: 50,
        raw_item_id: rawId,
        raw_per_unit: 1,
        wage_amount: 100,
      });
    expect(assignRes.status).toBe(201);
    const assignId = assignRes.body.id;

    // Output batch creates finished stock
    const batchRes = await request(app)
      .post(`/api/v1/workers/materials/${assignId}/batches`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ quantity: 50 });
    expect(batchRes.status).toBe(201);

    // 5. List Finished
    const listFinRes = await request(app)
      .get('/api/v1/inventory/finished')
      .set('Authorization', `Bearer ${user.token}`);

    expect(listFinRes.status).toBe(200);
    expect(listFinRes.body).toHaveLength(1);
    const finishedId = listFinRes.body[0].id;
    expect(listFinRes.body[0].quantity).toBe(50);

    // 6. Update Finished metadata (allowed) and quantity (blocked)
    const blockedQtyRes = await request(app)
      .put(`/api/v1/inventory/finished/${finishedId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ quantity: 100 });
    expect(blockedQtyRes.status).toBe(400);

    const updateFinMetaRes = await request(app)
      .put(`/api/v1/inventory/finished/${finishedId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ selling_price: 600, reorder_level: 15 });
    expect(updateFinMetaRes.status).toBe(200);
    expect(updateFinMetaRes.body.selling_price).toBe(600);

    // 7. Live Semi-Finished
    const liveSemiRes = await request(app)
      .get('/api/v1/inventory/semi-finished/live')
      .set('Authorization', `Bearer ${user.token}`);

    expect(liveSemiRes.status).toBe(200);

    // 8. Delete Raw
    await request(app).delete(`/api/v1/inventory/raw/${rawId}`).set('Authorization', `Bearer ${user.token}`).expect(204);
  });
});
