import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo } from '../src/db/mongo.js';
import { ContactService } from '../src/modules/contact/contact.service.js';
import { HealthService } from '../src/modules/health/health.service.js';
import { HealthRepository } from '../src/modules/health/health.repository.js';
import { ProfileService } from '../src/modules/profile/profile.service.js';
import { ProfileRepository } from '../src/modules/profile/profile.repository.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { UnauthorizedError } from '../src/utils/errors.js';

describe('Peripheral Domains Branch Coverage Suite', () => {
  const companyId = 'periph-' + Date.now();
  const scope = { companyId, company_id: companyId };
  let db: any;

  beforeAll(async () => {
    db = await connectMongo();
  });

  afterAll(async () => {
    if (db) {
      await db.collection('company').deleteMany({ company_id: companyId });
      await db.collection('user').deleteMany({ company_id: companyId });
      await db.collection('contact_messages').deleteMany({});
    }
    await closeMongo();
  });

  describe('ContactService 100% Branch Coverage', () => {
    it('covers all fallback and defined paths for contact submissions', async () => {
      // 1. With all fields defined
      const r1 = await ContactService.submitMessage({
        name: 'Alice Contact',
        email: 'alice@contact.com',
        message: 'Hello Support',
      });
      expect(r1.status).toBe('ok');

      // 2. With all fields undefined/null to exercise ?? '' fallbacks
      const r2 = await ContactService.submitMessage({});
      expect(r2.status).toBe('ok');
    });
  });

  describe('HealthService 100% Branch Coverage', () => {
    it('covers mongo up/down and redis up/down/disabled branches', async () => {
      const live = HealthService.getLiveness();
      expect(live.status).toBe('ok');

      const ready = await HealthService.getReadiness();
      expect(ready.status).toBe('ready');

      const detailed = await HealthService.getDetailedHealth();
      expect(detailed.status).toBe('healthy');

      const prom = await HealthService.getPrometheusMetrics();
      expect(prom).toContain('mongodb_up 1');

      // Degraded / Down simulated states
      const origCheckMongo = HealthRepository.checkMongo;
      const origCheckRedis = HealthRepository.checkRedis;

      try {
        // Mongo down
        HealthRepository.checkMongo = async () => ({ status: 'down', latency_ms: -1, error: 'Connection refused' });
        const readyDown = await HealthService.getReadiness();
        expect(readyDown.status).toBe('unhealthy');
        expect(readyDown.ready).toBe(false);

        // Redis down
        HealthRepository.checkRedis = async () => ({ status: 'down', latency_ms: -1, error: 'Redis unreachable' });
        const degraded = await HealthService.getDetailedHealth();
        expect(degraded.status).toBe('degraded');

        const promDown = await HealthService.getPrometheusMetrics();
        expect(promDown).toContain('mongodb_up 0');
        expect(promDown).toContain('redis_up 0');

        // Redis disabled
        HealthRepository.checkRedis = async () => ({ status: 'disabled', latency_ms: 0 });
        const promDisabled = await HealthService.getPrometheusMetrics();
        expect(promDisabled).toContain('redis_up -1');
      } finally {
        HealthRepository.checkMongo = origCheckMongo;
        HealthRepository.checkRedis = origCheckRedis;
      }
    });
  });

  describe('ProfileService 100% Branch Coverage', () => {
    it('covers getProfile, updateProfile, and settings with full and null variations', async () => {
      // 1. User not found throws UnauthorizedError
      await expect(
        ProfileService.getProfile(new ObjectId().toString(), scope)
      ).rejects.toThrow(UnauthorizedError);

      // 2. User exists with null optional fields and company exists
      const userOid = new ObjectId();
      await db.collection('user').insertOne({
        _id: userOid,
        email: 'profile_test@density.com',
        name: null,
        phone: null,
        location: null,
        username: null,
        profile_pic: null,
        company_id: companyId,
      });

      const compOid = new ObjectId();
      await db.collection('company').insertOne({
        _id: compOid,
        company_id: companyId,
        name: 'Profile Density Corp',
        address: null,
        email: null,
        phone: null,
        gst_number: null,
        logo_url: null,
        stamp_url: null,
        signature_url: null,
        bank_account_number: null,
        ifsc_code: null,
        bank_name: null,
        branch_name: null,
      });

      const profile = await ProfileService.getProfile(userOid.toString(), scope);
      expect(profile.user.username).toBe('profile_test'); // split('@')[0] fallback
      expect(profile.company?.name).toBe('Profile Density Corp');

      // 3. User exists without company
      const orphanScope = { companyId: 'orphan-comp-' + Date.now(), company_id: 'orphan-comp-' + Date.now() };
      const orphanProf = await ProfileService.getProfile(userOid.toString(), orphanScope);
      expect(orphanProf.company).toBeNull();

      // 4. Update profile with user fields and company fields
      const updatedProf = await ProfileService.updateProfile(userOid.toString(), scope, {
        name: 'Alice Manager',
        phone: '+91 9999900000',
        location: 'New Delhi',
        username: 'alicemgr',
        company_name: 'Profile Density Corp Renamed',
        address: '456 Business Park',
        gst_number: '27AAAAA0000A1Z5',
        bank_name: 'State Bank',
        ifsc_code: 'SBIN0001234',
        bank_account_number: '1234567890',
        branch_name: 'Connaught Place',
        logo_url: 'https://test.com/logo.png',
        stamp_url: 'https://test.com/stamp.png',
        signature_url: 'https://test.com/sig.png',
      });
      expect(updatedProf.user.name).toBe('Alice Manager');
      expect(updatedProf.company?.logo_url).toBe('https://test.com/logo.png');

      // 5. Update settings
      const settings = await ProfileService.getSettings(userOid.toString(), scope);
      expect(settings).toBeDefined();

      const updatedSettings = await ProfileService.updateSettings(userOid.toString(), scope, {
        realtime_dashboard_refresh: true,
        jwt_session_authentication: true,
        ai_assistant_enabled: true,
        inventory_workspace_mode: true,
        comments: true,
        weekly_summary: false,
        updates: true,
      });
      expect(updatedSettings.workspace_settings.realtime_dashboard_refresh).toBe(true);
      expect(updatedSettings.notifications.weekly_summary).toBe(false);
    });
  });

  describe('DashboardService Branch Coverage', () => {
    it('covers dashboard summary and financial metrics with empty and varied collections', async () => {
      const emptyScope = { companyId: 'dash-empty-' + Date.now(), company_id: 'dash-empty-' + Date.now() };
      const summary = await DashboardService.getSummaryData(emptyScope);
      expect(summary.total_revenue).toBe(0);
      expect(summary.total_profit).toBe(0);
      expect(summary.active_workers).toBe(0);

      const overview = await DashboardService.getDashboardData(emptyScope);
      expect(overview.billsCount).toBe(0);

      const revExp = await DashboardService.getRevExpData(emptyScope, 6);
      expect(Array.isArray(revExp.labels)).toBe(true);

      const trends = await DashboardService.getProfitTrends(emptyScope, 6, 'monthly');
      expect(Array.isArray(trends.labels)).toBe(true);

      const weeklyTrends = await DashboardService.getProfitTrends(emptyScope, 4, 'weekly');
      expect(Array.isArray(weeklyTrends.labels)).toBe(true);

      const dailyTrends = await DashboardService.getProfitTrends(emptyScope, 7, 'daily');
      expect(Array.isArray(dailyTrends.labels)).toBe(true);

      const topWorkers = await DashboardService.getTopWorkers(emptyScope);
      expect(topWorkers).toEqual([]);

      const workerPayments = await DashboardService.getWorkerPayments(emptyScope);
      expect(workerPayments).toEqual([]);

      const csv = await DashboardService.generateExportFile(emptyScope, 'summary');
      expect(csv).toMatch(/\/media\/exports\/.*\.csv/);

      const bzCsv = await DashboardService.generateExportFile(emptyScope, 'business_trends');
      expect(bzCsv).toMatch(/\/media\/exports\/.*\.csv/);

      const wmCsv = await DashboardService.generateExportFile(emptyScope, 'worker_management');
      expect(wmCsv).toMatch(/\/media\/exports\/.*\.csv/);

      const spCsv = await DashboardService.generateExportFile(emptyScope, 'salary_payments');
      expect(spCsv).toMatch(/\/media\/exports\/.*\.csv/);
    });
  });
});
