import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { UploadService } from '../src/modules/upload/upload.service.js';

describe('Upload Security, Formula Injection & Path Traversal Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('successfully processes a well-formed sanitized CSV file', async () => {
    const user = await createTestUser();

    const validCsv = [
      'date,product,category,quantity,production_cost,selling_price,region,customer_type',
      '2026-03-15,Cotton Shirt,Apparel,20,150.00,300.00,North,Retail',
      '2026-03-20,Denim Jeans,Apparel,10,400.00,800.00,West,Wholesale',
    ].join('\n');

    const res = await request(app)
      .post('/api/v1/upload/csv')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from(validCsv, 'utf-8'), 'sales_report.csv');

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);
    expect(res.body.warnings).toHaveLength(0);
  });

  it('detects and blocks CSV formula injection payloads starting with =, +, -, and @', async () => {
    const user = await createTestUser();

    const formulaPayloads = [
      "=cmd|' /C calc'!A0",
      "+cmd|' /C calc'!A0",
      "-2+cmd|' /C calc'!A0",
      "@SUM(1+1)*cmd|' /C calc'!A0",
      "=10+20",
    ];

    for (const maliciousVal of formulaPayloads) {
      const maliciousCsv = [
        'date,product,category,quantity,production_cost,selling_price,region,customer_type',
        `2026-03-15,${maliciousVal},Apparel,20,150.00,300.00,North,Retail`,
      ].join('\n');

      const res = await request(app)
        .post('/api/v1/upload/csv')
        .set('Authorization', `Bearer ${user.token}`)
        .attach('file', Buffer.from(maliciousCsv, 'utf-8'), 'injected.csv');

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('disallowed formula expression');
    }
  });

  it('rejects path traversal and zip-slip directory escape filenames', async () => {
    const user = await createTestUser();
    const scope = { companyId: user.companyId };
    const dummyBuffer = Buffer.from('date,product\n2026-01-01,Test', 'utf-8');

    const traversalFilenames = [
      '../../etc/passwd.csv',
      '..\\..\\windows\\system32\\calc.csv',
      'subdir/file.csv',
      '/absolute/path/file.csv',
    ];

    for (const badFilename of traversalFilenames) {
      await expect(
        UploadService.csvUpload(scope, dummyBuffer, badFilename)
      ).rejects.toThrow('Invalid or insecure filename.');
    }
  });

  it('rejects non-csv files and missing required column structures', async () => {
    const user = await createTestUser();

    // 1. Non-CSV extension
    const nonCsvRes = await request(app)
      .post('/api/v1/upload/csv')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from('binary data', 'utf-8'), 'malicious_script.sh');

    expect(nonCsvRes.status).toBe(400);
    expect(nonCsvRes.body.detail).toContain('valid CSV file');

    // 2. Missing columns
    const incompleteCsv = 'date,product,quantity\n2026-01-01,Widget,5';
    const incompleteRes = await request(app)
      .post('/api/v1/upload/csv')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from(incompleteCsv, 'utf-8'), 'incomplete.csv');

    expect(incompleteRes.status).toBe(400);
    expect(incompleteRes.body.detail).toContain('Missing required columns');
  });

  it('accumulates warnings and imports valid rows when CSV has malformed date or numbers', async () => {
    const user = await createTestUser();

    const mixedCsv = [
      'date,product,category,quantity,production_cost,selling_price,region,customer_type',
      '2026-03-15,Cotton Shirt,Apparel,20,150.00,300.00,North,Retail',
      'not-a-valid-date,Denim Jeans,Apparel,10,400.00,800.00,West,Wholesale',
      '2026-03-18,Silk Scarf,Apparel,not-a-qty,200.00,500.00,East,Retail',
    ].join('\n');

    const res = await request(app)
      .post('/api/v1/upload/csv')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from(mixedCsv, 'utf-8'), 'mixed.csv');

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.warnings.length).toBe(2);
    expect(res.body.warnings[0].row).toBe(2);
    expect(res.body.warnings[1].row).toBe(3);
  });
});
