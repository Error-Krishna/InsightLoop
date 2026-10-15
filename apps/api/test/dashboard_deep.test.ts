import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestUser, getDatabase, clearDatabase } from './testHelper.js';

describe('Dashboard Deep Analytics & Aggregation Suite', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('aggregates summary, rev-exp, profit-trends, workers, and top-workers', async () => {
    const user = await createTestUser();
    const db = getDatabase();

    const now = new Date();

    // 1. Insert bills
    await db.collection('bills').insertOne({
      company_id: user.companyId,
      bill_type: 'pakka',
      payment_status: 'paid',
      total_amount: 15000,
      subtotal: 14000,
      tax_amount: 1000,
      created_at: now,
      date: now,
    });

    // 2. Insert workers and worker payments
    const worker = await db.collection('workers').insertOne({
      company_id: user.companyId,
      name: 'Deepak Joshi',
      role: 'Master Craftsman',
      active: true,
      created_at: now,
    });

    await db.collection('pay_records').insertOne({
      company_id: user.companyId,
      worker_id: worker.insertedId.toString(),
      worker: worker.insertedId,
      units_produced: 100,
      rate_per_unit: 25,
      amount_paid: 2000,
      paid: false,
      date: now,
      created_at: now,
    });

    // 3. Test /api/v1/dashboard/summary
    const sumRes = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${user.token}`);

    expect(sumRes.status).toBe(200);

    // 4. Test /api/v1/dashboard/rev-exp
    const revRes = await request(app)
      .get('/api/v1/dashboard/rev-exp')
      .set('Authorization', `Bearer ${user.token}`);

    expect(revRes.status).toBe(200);

    // 5. Test /api/v1/dashboard/profit-trends
    const profRes = await request(app)
      .get('/api/v1/dashboard/profit-trends')
      .set('Authorization', `Bearer ${user.token}`);

    expect(profRes.status).toBe(200);

    // 6. Test /api/v1/dashboard/workers
    const workRes = await request(app)
      .get('/api/v1/dashboard/workers')
      .set('Authorization', `Bearer ${user.token}`);

    expect(workRes.status).toBe(200);
    expect(workRes.body.workers.length).toBeGreaterThan(0);
    expect(workRes.body.workers[0].name).toBe('Deepak Joshi');
    expect(workRes.body.workers[0].status).toBe('Partial');

    // 7. Test /api/v1/dashboard/top-workers
    const topRes = await request(app)
      .get('/api/v1/dashboard/top-workers')
      .set('Authorization', `Bearer ${user.token}`);

    expect(topRes.status).toBe(200);
    expect(topRes.body.workers.length).toBeGreaterThan(0);
    expect(topRes.body.workers[0].name).toBe('Deepak Joshi');
    expect(topRes.body.workers[0].total_payout).toBe(2000);
  });
});
