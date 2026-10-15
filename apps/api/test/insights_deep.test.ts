import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestUser, getDatabase, clearDatabase } from './testHelper.js';

describe('Insights Deep Unit & Calculation Suite', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('runs sales analysis with spike detection and product ranking', async () => {
    const user = await createTestUser();
    const db = getDatabase();

    // Insert 6 days of sales data to trigger moving average and spike detection
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

    await db.collection('business_data').insertMany([
      { company_id: user.companyId, product: 'Widget A', quantity: 10, selling_price: 100, date: daysAgo(5) },
      { company_id: user.companyId, product: 'Widget B', quantity: 10, selling_price: 100, date: daysAgo(4) },
      { company_id: user.companyId, product: 'Widget A', quantity: 10, selling_price: 100, date: daysAgo(3) },
      { company_id: user.companyId, product: 'Widget A', quantity: 100, selling_price: 100, date: daysAgo(2) }, // Huge spike!
      { company_id: user.companyId, product: 'Widget C', quantity: 10, selling_price: 100, date: daysAgo(1) },
      { company_id: user.companyId, product: 'Widget B', quantity: 10, selling_price: 100, date: daysAgo(0) },
    ]);

    // Analyze sales data
    const analyzeRes = await request(app)
      .post('/api/v1/insights/analyze')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.count).toBeGreaterThan(0);
    expect(Array.isArray(analyzeRes.body.insights)).toBe(true);

    const firstInsight = analyzeRes.body.insights[0];
    expect(firstInsight).toHaveProperty('id');
    expect(firstInsight).toHaveProperty('title');
    expect(firstInsight).toHaveProperty('description');

    // List insights
    const listRes = await request(app)
      .get('/api/v1/insights')
      .set('Authorization', `Bearer ${user.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(analyzeRes.body.count);

    // Export insight to CSV
    const exportRes = await request(app)
      .get(`/api/v1/insights/${firstInsight.id}/export`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.text).toContain('Insight Title,Description,Note');
    expect(exportRes.text).toContain('Period,Value');

    // Delete insight
    const deleteRes = await request(app)
      .delete(`/api/v1/insights/${firstInsight.id}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(deleteRes.status).toBe(204);

    // Verify deleted
    const getDeletedRes = await request(app)
      .get(`/api/v1/insights/${firstInsight.id}/export`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(getDeletedRes.status).toBe(404);
  });

  it('handles empty business data gracefully in analyze', async () => {
    const user = await createTestUser();

    const analyzeRes = await request(app)
      .post('/api/v1/insights/analyze')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body).toEqual({ count: 0, insights: [] });
  });

  it('handles invalid insight IDs gracefully', async () => {
    const user = await createTestUser();

    const exportRes = await request(app)
      .get('/api/v1/insights/invalid-id/export')
      .set('Authorization', `Bearer ${user.token}`);
    expect(exportRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete('/api/v1/insights/invalid-id')
      .set('Authorization', `Bearer ${user.token}`);
    expect(deleteRes.status).toBe(404);
  });
});
