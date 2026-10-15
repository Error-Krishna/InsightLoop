import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { getCollection } from '../src/db/mongo.js';
import { ObjectId } from 'mongodb';

describe('Health, Contact, AI & Insights Integration Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('verifies health endpoints (live and ready)', async () => {
    const liveRes = await request(app).get('/api/v1/health/live');
    expect(liveRes.status).toBe(200);
    expect(liveRes.body.status).toBe('ok');

    const readyRes = await request(app).get('/api/v1/health/ready');
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.status).toBe('ready');
  });

  it('submits contact feedback and rejects disallowed HTTP methods', async () => {
    const contactRes = await request(app)
      .post('/api/v1/contact')
      .send({
        name: 'Anita Desai',
        email: 'anita@example.com',
        message: 'Interested in enterprise subscription for 50 factories.',
      });

    expect(contactRes.status).toBe(200);
    expect(contactRes.body.status).toBe('ok');

    // Method not allowed check
    const badMethodRes = await request(app).get('/api/v1/contact');
    expect(badMethodRes.status).toBe(405);
  });

  it('retrieves AI assistant config and executes an AI command', async () => {
    const user = await createTestUser();

    const configRes = await request(app)
      .get('/api/v1/ai/config')
      .set('Authorization', `Bearer ${user.token}`);

    expect(configRes.status).toBe(200);
    expect(configRes.body.websocket_path).toBe('/ws/ai-assistant/');

    const commandRes = await request(app)
      .post('/api/v1/ai/command')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        command: 'Show me total revenue for this month',
      });

    expect(commandRes.status).toBe(200);
    expect(commandRes.body.action).toBeDefined();
  });

  it('generates insights analysis, exports insight, and deletes insight', async () => {
    const user = await createTestUser();
    const insightsCol = getCollection('insights');

    const insightId = new ObjectId();
    await insightsCol.insertOne({
      _id: insightId,
      company_id: user.companyId,
      title: 'Monthly Revenue Surge',
      summary: 'Revenue increased by 25% due to seasonal demand.',
      category: 'revenue',
      metrics: { growth: 0.25 },
      created_at: new Date(),
    });

    // 1. List Insights
    const listRes = await request(app)
      .get('/api/v1/insights')
      .set('Authorization', `Bearer ${user.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    // 2. Export Insight
    const exportRes = await request(app)
      .get(`/api/v1/insights/${insightId.toString()}/export`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.text).toContain('Monthly Revenue Surge');

    // 3. Delete Insight
    const delRes = await request(app)
      .delete(`/api/v1/insights/${insightId.toString()}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(delRes.status).toBe(204);

    // 4. Trigger Analyze
    const analyzeRes = await request(app)
      .post('/api/v1/insights/analyze')
      .set('Authorization', `Bearer ${user.token}`);

    expect(analyzeRes.status).toBe(200);
  });
});
