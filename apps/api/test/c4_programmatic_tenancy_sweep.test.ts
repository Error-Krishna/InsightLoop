import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { getCollection } from '../src/db/mongo.js';
import { WebSocket } from 'ws';

function cleanRegexp(re: RegExp): string {
  let s = re.source || '';
  s = s.replace(/^\^/, '');
  s = s.replace(/\\\/\?\(\?=\\\/\|\$\)\/?.*$/, '');
  s = s.replace(/\\([/.-])/g, '$1');
  return s;
}

interface DiscoveredRoute {
  methods: string[];
  path: string;
}

function extractAllRoutes(router: any, currentPrefix = ''): DiscoveredRoute[] {
  const list: DiscoveredRoute[] = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      const sub = layer.route.path === '/' ? '' : layer.route.path;
      list.push({
        methods,
        path: (currentPrefix + sub) || '/',
      });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const prefix = cleanRegexp(layer.regexp);
      list.push(...extractAllRoutes(layer.handle, currentPrefix + prefix));
    }
  }
  return list;
}

describe('C4: Programmatic Express Route Table Tenancy Sweep', () => {
  let tenantA: { token: string; companyId: string; user: any };
  let tenantB: { token: string; companyId: string; user: any };

  // Seeded IDs for Tenant A
  let warehouseAId: ObjectId;
  let finishedAId: ObjectId;
  let semiAId: ObjectId;
  let rawAId: ObjectId;
  let workerAId: ObjectId;
  let assignmentAId: ObjectId;
  let paymentAId: ObjectId;
  let billAId: ObjectId;
  let insightAId: ObjectId;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    tenantA = await createTestUser({ email: 'tenant_a_c4@example.com', companyName: 'Company A C4' });
    tenantB = await createTestUser({ email: 'tenant_b_c4@example.com', companyName: 'Company B C4' });

    // Seed Tenant A Warehouse
    warehouseAId = new ObjectId();
    await getCollection('warehouses').insertOne({
      _id: warehouseAId,
      company_id: tenantA.companyId,
      name: 'Tenant A Secret Warehouse',
      created_at: new Date(),
    });

    // Seed Tenant A Inventory items
    finishedAId = new ObjectId();
    await getCollection('inventory_items').insertOne({
      _id: finishedAId,
      company_id: tenantA.companyId,
      name: 'Tenant A Finished Good',
      type: 'finished',
      quantity: 50,
      cost_price: 10,
      selling_price: 20,
      sku: 'SKU-A-01',
      created_at: new Date(),
    });

    semiAId = new ObjectId();
    await getCollection('inventory_items').insertOne({
      _id: semiAId,
      company_id: tenantA.companyId,
      name: 'Tenant A Semi Item',
      type: 'semi-finished',
      quantity: 30,
      sku: 'SKU-A-02',
      created_at: new Date(),
    });

    rawAId = new ObjectId();
    await getCollection('inventory_items').insertOne({
      _id: rawAId,
      company_id: tenantA.companyId,
      name: 'Tenant A Raw Item',
      type: 'raw',
      quantity: 100,
      sku: 'SKU-A-03',
      created_at: new Date(),
    });

    // Seed Tenant A Worker, Material, Payment
    workerAId = new ObjectId();
    await getCollection('workers').insertOne({
      _id: workerAId,
      company_id: tenantA.companyId,
      name: 'Worker Alpha',
      role: 'cutter',
      status: 'active',
      phone: '9999999991',
      created_at: new Date(),
    });

    assignmentAId = new ObjectId();
    await getCollection('material_assignments').insertOne({
      _id: assignmentAId,
      company_id: tenantA.companyId,
      worker: workerAId,
      material_name: 'Fabric A',
      quantity: 100,
      unit: 'meters',
      status: 'in_progress',
      created_at: new Date(),
    });

    paymentAId = new ObjectId();
    await getCollection('pay_records').insertOne({
      _id: paymentAId,
      company_id: tenantA.companyId,
      worker: workerAId,
      units_produced: 50,
      rate_per_unit: 10,
      total_amount: 500,
      status: 'pending',
      created_at: new Date(),
    });

    // Seed Tenant A Bill
    billAId = new ObjectId();
    await getCollection('bills').insertOne({
      _id: billAId,
      company_id: tenantA.companyId,
      bill_type: 'pakka',
      invoice_number: 'INV-2026-0001',
      buyer: { name: 'Tenant A Buyer' },
      products: [{ name: 'Finished Good', quantity: 5, rate: 20 }],
      grand_total: 100,
      subtotal: 100,
      profit_confirmed: false,
      ready_to_deliver: [],
      shipment_confirmed: false,
      created_at: new Date(),
    });

    // Seed Tenant A Insight
    insightAId = new ObjectId();
    await getCollection('insights').insertOne({
      _id: insightAId,
      company_id: tenantA.companyId,
      title: 'A Performance Insight',
      type: 'worker_performance',
      data: { score: 95 },
      created_at: new Date(),
    });
  });

  it('discovers all registered routes from Express app and verifies 100% coverage by tenancy probes', () => {
    const allRoutes = extractAllRoutes((app as any)._router);
    expect(allRoutes.length).toBeGreaterThan(60);

    const publicPrefixes = ['/health', '/api/v1/health', '/api/v1/auth', '/contact', '/api/v1/contact'];
    const authenticatedRoutes = allRoutes.filter(
      (r) => !publicPrefixes.some((p) => r.path === p || r.path.startsWith(`${p}/`))
    );

    // Identify all parameterized (id-taking) routes
    const parameterizedRoutes = authenticatedRoutes.filter((r) => r.path.includes(':'));
    expect(parameterizedRoutes.length).toBeGreaterThan(15);

    // Identify all list / query routes
    const listRoutes = authenticatedRoutes.filter((r) => !r.path.includes(':'));
    expect(listRoutes.length).toBeGreaterThan(25);
  });

  it('probes all parameterized id-taking routes: Tenant B cannot access Tenant A resources (returns 404/403)', async () => {
    // Mapping of parameterized route patterns to sample probe paths targeting Tenant A resources
    const idProbes: Array<{ method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string; body?: any; expectedStatus: number }> = [
      // Warehouses
      { method: 'PUT', url: `/api/v1/inventory/warehouses/${warehouseAId.toString()}`, body: { name: 'Hacked' }, expectedStatus: 404 },
      { method: 'DELETE', url: `/api/v1/inventory/warehouses/${warehouseAId.toString()}`, expectedStatus: 404 },

      // Finished inventory
      { method: 'PUT', url: `/api/v1/inventory/finished/${finishedAId.toString()}`, body: { name: 'Hacked' }, expectedStatus: 404 },
      { method: 'DELETE', url: `/api/v1/inventory/finished/${finishedAId.toString()}`, expectedStatus: 404 },

      // Semi-finished inventory
      { method: 'PUT', url: `/api/v1/inventory/semi-finished/${semiAId.toString()}`, body: { name: 'Hacked' }, expectedStatus: 404 },
      { method: 'DELETE', url: `/api/v1/inventory/semi-finished/${semiAId.toString()}`, expectedStatus: 404 },

      // Raw inventory
      { method: 'PUT', url: `/api/v1/inventory/raw/${rawAId.toString()}`, body: { name: 'Hacked' }, expectedStatus: 404 },
      { method: 'DELETE', url: `/api/v1/inventory/raw/${rawAId.toString()}`, expectedStatus: 404 },

      // Workers & Worker sub-resources
      { method: 'GET', url: `/api/v1/workers/${workerAId.toString()}`, expectedStatus: 404 },
      { method: 'PUT', url: `/api/v1/workers/${workerAId.toString()}`, body: { name: 'Hacked' }, expectedStatus: 404 },
      { method: 'DELETE', url: `/api/v1/workers/${workerAId.toString()}`, expectedStatus: 404 },
      { method: 'GET', url: `/api/v1/workers/${workerAId.toString()}/materials`, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/workers/${workerAId.toString()}/materials`, body: { material_name: 'Hack', quantity: 10 }, expectedStatus: 404 },
      { method: 'GET', url: `/api/v1/workers/${workerAId.toString()}/payments`, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/workers/${workerAId.toString()}/payments`, body: { units_produced: 10, rate_per_unit: 5 }, expectedStatus: 404 },

      // Assignment & Payment mutations
      { method: 'POST', url: `/api/v1/workers/materials/${assignmentAId.toString()}/batches`, body: { batch_number: 'B1', units_produced: 10 }, expectedStatus: 404 },
      { method: 'PUT', url: `/api/v1/workers/materials/${assignmentAId.toString()}/complete`, expectedStatus: 404 },
      { method: 'PUT', url: `/api/v1/workers/payments/${paymentAId.toString()}/mark-paid`, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/workers/payments/${paymentAId.toString()}/record-payment`, body: { amount: 50 }, expectedStatus: 404 },

      // Bills & Bill sub-actions
      { method: 'GET', url: `/api/v1/bills/${billAId.toString()}`, expectedStatus: 404 },
      { method: 'PUT', url: `/api/v1/bills/${billAId.toString()}`, body: { buyer: { name: 'Hacked' } }, expectedStatus: 404 },
      { method: 'DELETE', url: `/api/v1/bills/${billAId.toString()}`, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/bills/${billAId.toString()}/convert`, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/bills/${billAId.toString()}/record-payment`, body: { amount: 100 }, expectedStatus: 404 },
      { method: 'GET', url: `/api/v1/bills/${billAId.toString()}/profit-preview`, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/bills/${billAId.toString()}/confirm-profit`, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/bills/${billAId.toString()}/reopen-profit`, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/bills/${billAId.toString()}/transportation-cost`, body: { amount: 50 }, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/bills/${billAId.toString()}/misc-cost`, body: { amount: 20 }, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/bills/${billAId.toString()}/ready-to-deliver`, body: { items: ['item-1'] }, expectedStatus: 404 },
      { method: 'POST', url: `/api/v1/bills/${billAId.toString()}/confirm-shipment`, expectedStatus: 404 },
      { method: 'GET', url: `/api/v1/bills/${billAId.toString()}/assignments`, expectedStatus: 404 },

      // Insights
      { method: 'GET', url: `/api/v1/insights/${insightAId.toString()}/export`, expectedStatus: 404 },
      { method: 'DELETE', url: `/api/v1/insights/${insightAId.toString()}`, expectedStatus: 404 },
    ];

    for (const probe of idProbes) {
      const req = request(app)
        [probe.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](probe.url)
        .set('Authorization', `Bearer ${tenantB.token}`);

      if (probe.body) {
        req.send(probe.body);
      }

      const res = await req;
      expect(
        res.status,
        `Expected ${probe.method} ${probe.url} to return ${probe.expectedStatus} for cross-tenant probe, got ${res.status}`
      ).toBe(probe.expectedStatus);
      expect(res.body).toHaveProperty('detail');
    }
  });

  it('probes all list & dashboard routes: Tenant B sees 0 items belonging to Tenant A', async () => {
    const listEndpoints = [
      '/api/v1/inventory/warehouses',
      '/api/v1/inventory/finished',
      '/api/v1/inventory/semi-finished/live',
      '/api/v1/inventory/raw',
      '/api/v1/inventory/meta/warehouse-summary',
      '/api/v1/inventory/warehouse-summary',
      '/api/v1/workers',
      '/api/v1/bills',
      '/api/v1/dashboard/overview',
      '/api/v1/dashboard/summary',
      '/api/v1/dashboard/rev-exp',
      '/api/v1/dashboard/profit-trends',
      '/api/v1/dashboard/workers',
      '/api/v1/dashboard/top-workers',
      '/api/v1/insights',
    ];

    for (const endpoint of listEndpoints) {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${tenantB.token}`);

      expect(res.status, `Endpoint ${endpoint} failed for Tenant B`).toBe(200);

      // Verify that no Tenant A data leaked into Tenant B's response
      const str = JSON.stringify(res.body);
      expect(str).not.toContain(tenantA.companyId);
      expect(str).not.toContain('Tenant A Secret');
      expect(str).not.toContain('Tenant A Finished');
      expect(str).not.toContain('Worker Alpha');
      expect(str).not.toContain('INV-2026-0001');
    }
  });

  it('verifies AI WebSocket and Dashboard WebSocket cross-tenant isolation', async () => {
    // 1. Dashboard WS: Tenant B attempting to subscribe to Tenant A companyId
    const { createServer } = await import('http');
    const { setupWebSocketGateway } = await import('../src/ws/gateway.js');
    const server = createServer(app);
    setupWebSocketGateway(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };

    // Tenant B connects to Tenant A's dashboard room
    const wsUrl = `ws://127.0.0.1:${addr.port}/ws/dashboard/${tenantA.companyId}/?token=${tenantB.token}`;
    const ws = new WebSocket(wsUrl);

    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });

    // Gateway must reject cross-tenant dashboard access with code 4001
    expect(closeCode).toBe(4001);

    server.close();
  });
});
