import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestUser, getDatabase, clearDatabase } from './testHelper.js';

describe('AI Assistant Module Deep Command & Analytics Suite', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('processes export commands for all business entities', async () => {
    const user = await createTestUser();

    // 1. Export business trends
    const res1 = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'Export business trends' });

    expect(res1.status).toBe(200);
    expect(res1.body.action).toBe('download');
    expect(res1.body.file_url).toContain('business_trends');

    // 2. Export workers
    const res2 = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'export staff' });

    expect(res2.status).toBe(200);
    expect(res2.body.action).toBe('download');
    expect(res2.body.file_url).toContain('worker_management');

    // 3. Export salary
    const res3 = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'export payroll' });

    expect(res3.status).toBe(200);
    expect(res3.body.action).toBe('download');
    expect(res3.body.file_url).toContain('salary_payments');

    // 4. Export full/complete
    const res4 = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'export complete' });

    expect(res4.status).toBe(200);
    expect(res4.body.action).toBe('download');
    expect(res4.body.file_url).toContain('complete_analytics');

    // 5. Bare export command asks for clarification
    const res5 = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'export' });

    expect(res5.status).toBe(200);
    expect(res5.body.action).toBe('message');
    expect(res5.body.content).toContain('specify what to export');
  });

  it('handles navigation shortcuts for dashboard, inventory, bills, workers', async () => {
    const user = await createTestUser();

    const checkNav = async (cmd: string, expectedUrl: string) => {
      const res = await request(app)
        .post('/api/v1/ai/command')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ command: cmd });
      expect(res.status).toBe(200);
      expect(res.body.action).toBe('navigate');
      expect(res.body.url).toBe(expectedUrl);
    };

    await checkNav('go to dashboard', '/dashboard');
    await checkNav('view insights', '/insights');
    await checkNav('upload files', '/upload');
    await checkNav('manage workers', '/workers');
    await checkNav('show bills', '/bills/pakka');
    await checkNav('check stock inventory', '/inventory/finished');
  });

  it('aggregates and displays revenue, profit, and worker analytics', async () => {
    const user = await createTestUser();
    const db = getDatabase();

    // Seed some business data and worker
    const today = new Date();
    await db.collection('business_data').insertOne({
      company_id: user.companyId,
      date: today,
      quantity: 50,
      selling_price: 200,
      production_cost: 120,
    });

    const worker = await db.collection('workers').insertOne({
      company_id: user.companyId,
      name: 'Ramesh',
      role: 'Weaver',
      is_active: true,
    });

    await db.collection('pay_records').insertOne({
      company_id: user.companyId,
      worker_id: worker.insertedId.toString(),
      worker: worker.insertedId,
      units_produced: 25,
      rate_per_unit: 10,
      amount_paid: 250,
      paid: true,
      date: today,
    });

    await db.collection('material_assignments').insertOne({
      company_id: user.companyId,
      worker_id: worker.insertedId.toString(),
      worker: worker.insertedId,
      quantity: 10,
      price_per_unit: 5,
      created_at: today,
    });

    // 1. Show revenue
    const revRes = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'show revenue trends' });

    expect(revRes.status).toBe(200);
    expect(revRes.body.action).toBe('display');
    const revData = JSON.parse(revRes.body.content);
    expect(revData.type).toBe('revenue_trends');
    expect(revData.data.length).toBeGreaterThan(0);

    // 2. Show profit
    const profRes = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'what is profit margin' });

    expect(profRes.status).toBe(200);
    expect(profRes.body.action).toBe('display');
    const profData = JSON.parse(profRes.body.content);
    expect(profData.type).toBe('profit_analysis');
    expect(profData.data.length).toBeGreaterThan(0);

    // 3. Show worker productivity
    const workRes = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'show worker productivity' });

    expect(workRes.status).toBe(200);
    expect(workRes.body.action).toBe('display');
    const workData = JSON.parse(workRes.body.content);
    expect(workData.type).toBe('worker_performance');
    expect(workData.data[0].name).toBe('Ramesh');
    expect(workData.data[0].efficiency).toBeGreaterThan(0);

    // 4. Unknown query fallback
    const unknownRes = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ command: 'hello assistant' });

    expect(unknownRes.status).toBe(200);
    expect(unknownRes.body.action).toBe('message');
  });
});
