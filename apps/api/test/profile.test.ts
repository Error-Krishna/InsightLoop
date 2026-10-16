import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { getCollection } from '../src/db/mongo.js';

describe('Profile Module Integration Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('fetches profile, updates profile attributes, and updates settings', async () => {
    const user = await createTestUser();

    // Seed company
    await getCollection('company').updateOne(
      { company_id: user.companyId },
      {
        $set: {
          name: 'Initial Company',
          address: '100 Industrial Area',
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );

    // 1. Get Profile
    const profileRes = await request(app)
      .get('/api/v1/profile')
      .set('Authorization', `Bearer ${user.token}`);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.user.email).toBe(user.email);
    expect(profileRes.body.company.name).toBe('Initial Company');

    // 2. Update Profile
    const updateRes = await request(app)
      .put('/api/v1/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Updated Name',
        phone: '9123456789',
        company_name: 'Super Company Ltd',
        gst_number: '29ABCDE1234F1Z5',
        bank_name: 'HDFC Bank',
        ifsc_code: 'HDFC0001234',
        bank_account_number: '50100234567890',
        branch_name: 'Indiranagar',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.user.name).toBe('Updated Name');
    expect(updateRes.body.company.name).toBe('Super Company Ltd');
    expect(updateRes.body.company.gst_number).toBe('29ABCDE1234F1Z5');

    // 3. Get Settings
    const settingsRes = await request(app)
      .get('/api/v1/profile/settings')
      .set('Authorization', `Bearer ${user.token}`);

    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.workspace_settings.realtime_dashboard_refresh).toBe(true);

    // 4. Update Settings
    const updateSettingsRes = await request(app)
      .put('/api/v1/profile/settings')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        realtime_dashboard_refresh: false,
        ai_assistant_enabled: false,
        weekly_summary: false,
      });

    expect(updateSettingsRes.status).toBe(200);
    expect(updateSettingsRes.body.workspace_settings.realtime_dashboard_refresh).toBe(false);
    expect(updateSettingsRes.body.workspace_settings.ai_assistant_enabled).toBe(false);
    expect(updateSettingsRes.body.notifications.weekly_summary).toBe(false);
  });
});
