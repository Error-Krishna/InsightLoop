import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestUser, clearDatabase } from './testHelper.js';

describe('Workers Payments & Lifecycle Deep Suite', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('creates payments, records partial payments, and marks fully paid', async () => {
    const user = await createTestUser();

    // 1. Create a worker
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Sunil Kumar',
        role: 'Tailor',
        phone: '9876543210',
        active: true,
      });

    expect(workerRes.status).toBe(201);
    const workerId = workerRes.body.id;

    // 2. Create payment (units=100, rate=5, totalOwed=500, amountPaid=200)
    const payRes = await request(app)
      .post(`/api/v1/workers/${workerId}/payments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        product_name: 'Cotton Shirt',
        units_produced: 100,
        rate_per_unit: 5,
        amount_paid: 200,
        date: new Date().toISOString(),
      });

    expect(payRes.status).toBe(201);
    expect(payRes.body.total_amount).toBe(500);
    expect(payRes.body.amount_paid).toBe(200);
    expect(payRes.body.paid).toBe(false);
    const paymentId = payRes.body.id;

    // 3. List payments
    const listRes = await request(app)
      .get(`/api/v1/workers/${workerId}/payments`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);

    // 4. Record partial payment of 100 (amountPaid becomes 300)
    const partialRes = await request(app)
      .post(`/api/v1/workers/payments/${paymentId}/record-payment`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ amount: 100 });

    expect(partialRes.status).toBe(201);
    expect(partialRes.body.amount_paid).toBe(300);
    expect(partialRes.body.paid).toBe(false);

    // 5. Mark fully paid
    const markRes = await request(app)
      .put(`/api/v1/workers/payments/${paymentId}/mark-paid`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(markRes.status).toBe(200);
    expect(markRes.body.paid).toBe(true);
    expect(markRes.body.amount_paid).toBe(500);

    // 6. Attempting partial payment on already paid record should reject
    const failPartial = await request(app)
      .post(`/api/v1/workers/payments/${paymentId}/record-payment`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ amount: 50 });

    expect(failPartial.status).toBe(400);

    // 7. Validation rejects: negative amount
    const negRes = await request(app)
      .post(`/api/v1/workers/${workerId}/payments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        product_name: 'Cotton Shirt',
        units_produced: 10,
        rate_per_unit: 5,
        amount_paid: -10,
      });

    expect(negRes.status).toBe(400);

    // 8. Amount paid > total owed
    const overRes = await request(app)
      .post(`/api/v1/workers/${workerId}/payments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        product_name: 'Cotton Shirt',
        units_produced: 10,
        rate_per_unit: 5,
        amount_paid: 100, // total is 50
      });

    expect(overRes.status).toBe(400);
  });

  it('rejects payments with invalid worker id or not found', async () => {
    const user = await createTestUser();

    const badIdRes = await request(app)
      .post('/api/v1/workers/invalid-worker-id/payments')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        product_name: 'Cotton Shirt',
        units_produced: 10,
        rate_per_unit: 5,
      });

    expect(badIdRes.status).toBe(400);

    const nonExistentRes = await request(app)
      .post('/api/v1/workers/507f1f77bcf86cd799439011/payments')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        product_name: 'Cotton Shirt',
        units_produced: 10,
        rate_per_unit: 5,
      });

    expect(nonExistentRes.status).toBe(404);
  });
});
