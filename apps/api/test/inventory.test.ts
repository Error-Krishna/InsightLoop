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

    // 3b. Create an item linked to this warehouse
    await request(app)
      .post('/api/v1/inventory/finished')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Warehouse Stocked Item',
        unit: 'pcs',
        quantity: 25,
        cost_price: 100,
        selling_price: 200,
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

    // 1. Create Finished Item
    const finishedRes = await request(app)
      .post('/api/v1/inventory/finished')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Classic White Shirt',
        unit: 'pcs',
        quantity: 50,
        cost_price: 250,
        selling_price: 500,
        reorder_level: 10,
      });

    expect(finishedRes.status).toBe(201);
    expect(finishedRes.body.name).toBe('Classic White Shirt');
    expect(finishedRes.body.sku).toBeDefined();
    const finishedId = finishedRes.body.id as string;

    // 2. Update Finished Item
    const updateFinRes = await request(app)
      .put(`/api/v1/inventory/finished/${finishedId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        quantity: 60,
      });

    expect(updateFinRes.status).toBe(200);
    expect(updateFinRes.body.quantity).toBe(60);

    // 3. List Finished
    const listFinRes = await request(app)
      .get('/api/v1/inventory/finished')
      .set('Authorization', `Bearer ${user.token}`);

    expect(listFinRes.status).toBe(200);
    expect(listFinRes.body).toHaveLength(1);

    // 4. Create Semi-Finished Item
    const semiRes = await request(app)
      .post('/api/v1/inventory/semi-finished')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Cut Fabric Pieces',
        unit: 'sets',
        quantity: 100,
        cost_price: 100,
        selling_price: 150,
      });

    expect(semiRes.status).toBe(201);
    const semiId = semiRes.body.id as string;

    // 5. Live Semi-Finished
    const liveSemiRes = await request(app)
      .get('/api/v1/inventory/semi-finished/live')
      .set('Authorization', `Bearer ${user.token}`);

    expect(liveSemiRes.status).toBe(200);

    // 6. Create Raw Material
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
    const rawId = rawRes.body.id as string;

    // 7. List Raw
    const listRawRes = await request(app)
      .get('/api/v1/inventory/raw')
      .set('Authorization', `Bearer ${user.token}`);

    expect(listRawRes.status).toBe(200);
    expect(listRawRes.body).toHaveLength(1);

    // 8. Delete all
    await request(app).delete(`/api/v1/inventory/finished/${finishedId}`).set('Authorization', `Bearer ${user.token}`).expect(204);
    await request(app).delete(`/api/v1/inventory/semi-finished/${semiId}`).set('Authorization', `Bearer ${user.token}`).expect(204);
    await request(app).delete(`/api/v1/inventory/raw/${rawId}`).set('Authorization', `Bearer ${user.token}`).expect(204);
  });
});
