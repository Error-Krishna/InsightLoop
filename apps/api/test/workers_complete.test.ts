import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { getCollection } from '../src/db/mongo.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';

describe('Workers Idempotent Complete & Kill-Resume Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('completes an assignment and synchronizes inventory and payment atomically', async () => {
    const user = await createTestUser();
    const workersCol = getCollection('workers');
    const workerId = new ObjectId();

    await workersCol.insertOne({
      _id: workerId,
      company_id: user.companyId,
      name: 'Ramesh Kumar',
      is_active: true,
      created_at: new Date(),
    });

    const itemsCol = getCollection('inventory_items');
    await itemsCol.insertOne({
      company_id: user.companyId,
      name: 'Silk Yarn Raw',
      type: 'finished',
      quantity: 0,
      created_at: new Date(),
    });

    // Create assignment
    const assignRes = await request(app)
      .post(`/api/v1/workers/${workerId.toString()}/materials/`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        material_name: 'Silk Yarn Raw',
        quantity: 100,
        price_per_unit: 15,
        wage_amount: 500,
      });

    expect(assignRes.status).toBe(201);
    const assignmentId = assignRes.body.id as string;

    // Add delivery batches
    const batchRes = await request(app)
      .post(`/api/v1/workers/materials/${assignmentId}/batches`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        quantity: 90,
        notes: 'Delivered batch 1',
      });

    expect(batchRes.status).toBe(201);

    // Complete assignment
    const completeRes = await request(app)
      .put(`/api/v1/workers/materials/${assignmentId}/complete`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('completed');
    expect(completeRes.body.wastage_quantity).toBe(10); // 100 - 90

    // Verify inventory received exactly 90 units
    const item = await itemsCol.findOne({
      company_id: user.companyId,
      name: 'Silk Yarn Raw',
    });

    expect(item).toBeDefined();
    expect(item?.quantity).toBe(90);

    // Second call must be rejected as already completed
    const duplicateRes = await request(app)
      .put(`/api/v1/workers/materials/${assignmentId}/complete`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(duplicateRes.status).toBe(400);
  });

  it('handles simulated kill-and-resume gracefully without double-crediting inventory', async () => {
    const user = await createTestUser();
    const scope = { companyId: user.companyId };
    const workerId = new ObjectId();

    await getCollection('workers').insertOne({
      _id: workerId,
      company_id: user.companyId,
      name: 'Suresh Patel',
      is_active: true,
      created_at: new Date(),
    });

    const assignmentId = new ObjectId();
    // Simulate an assignment that was killed midway:
    // Inventory was synced, but process terminated before pay_record and status completion.
    await getCollection('material_assignments').insertOne({
      _id: assignmentId,
      company_id: user.companyId,
      worker_id: workerId.toString(),
      worker: { _id: workerId, name: 'Suresh Patel' },
      material_name: 'Cotton Fabric 100m',
      quantity: 50,
      price_per_unit: 20,
      wage_amount: 300,
      batches: [{ quantity: 50, date: new Date().toISOString() }],
      synced_to_inventory: true, // Step 1 was executed before kill
      pay_record_id: null,       // Step 2 was interrupted
      status: 'open',
      created_at: new Date(),
    });

    // Seed inventory with what Step 1 had added
    const itemsCol = getCollection('inventory_items');
    await itemsCol.insertOne({
      company_id: user.companyId,
      name: 'Cotton Fabric 100m (Finished)',
      category: 'Finished Goods',
      quantity: 50,
      created_at: new Date(),
    });

    // Resume execution
    const completed = await WorkersService.completeAssignment(scope, assignmentId.toString());

    expect(completed.status).toBe('completed');

    // Crucial assertion: inventory quantity must STILL be 50 (NO double increment)
    const inventoryItem = await itemsCol.findOne({
      company_id: user.companyId,
      name: 'Cotton Fabric 100m (Finished)',
    });
    expect(inventoryItem?.quantity).toBe(50);

    // Pay record was created on resume
    const payRecordsCol = getCollection('pay_records');
    const payRecord = await payRecordsCol.findOne({
      company_id: user.companyId,
      product_name: 'Cotton Fabric 100m',
    });
    expect(payRecord).toBeDefined();
    expect(payRecord?.rate_per_unit).toBe(300);
  });
});
