import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestUser, clearDatabase } from './testHelper.js';
import { UploadService } from '../src/modules/upload/upload.service.js';

describe('Approved Fix List Verification & Negative Proof Suite', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('Approved Fix #1: Atomic Invoice Sequencing vs Legacy Race Conditions', async () => {
    const user = await createTestUser();

    // Spawn 10 concurrent bill creations
    const requests = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post('/api/v1/bills')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          bill_type: 'pakka',
          buyer: { name: `Buyer ${i}` },
          products: [{ name: 'Item', quantity: 1, rate: 100 }],
        })
    );

    const responses = await Promise.all(requests);
    const invoiceNumbers = responses.map((r) => r.body.invoice_number);

    // Verify all 10 are strictly unique (in legacy Django, sequential read-then-write produced duplicates)
    const uniqueSet = new Set(invoiceNumbers);
    expect(uniqueSet.size).toBe(10);
    expect(invoiceNumbers.every((inv) => /^INV-\d{4}-\d{5}$/.test(inv))).toBe(true);
  });

  it('Approved Fix #3: Formula Injection Protection in CSV Uploads', async () => {
    const user = await createTestUser();

    // In legacy Django, this was accepted directly into the database. In Node, it is rejected with 400.
    const dangerousCsv = [
      'date,product,category,quantity,production_cost,selling_price,region,customer_type',
      "=cmd|' /C calc'!A0,Dangerous Product,Apparel,5,100,200,North,Retail",
    ].join('\n');

    const res = await request(app)
      .post('/api/v1/upload/csv')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from(dangerousCsv, 'utf-8'), 'payload.csv');

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('disallowed formula expression');
  });

  it('Approved Fix #3b: Path Traversal Protection in Upload Filenames', async () => {
    const user = await createTestUser();
    const scope = { companyId: user.companyId };
    const dummyBuffer = Buffer.from('date,product\n2026-01-01,Test', 'utf-8');

    // In legacy Django, raw filename could cause directory traversal on ephemeral disk. In Node, rejected.
    await expect(
      UploadService.csvUpload(scope, dummyBuffer, '../../etc/passwd.csv')
    ).rejects.toThrow('Invalid or insecure filename.');
  });
});
