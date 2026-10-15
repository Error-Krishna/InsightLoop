import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectMongo, closeMongo, getDb } from '../src/db/mongo.js';
import { UploadService } from '../src/modules/upload/upload.service.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('B7: CSV Upload Rules Suite', () => {
  const scope: TenantScope = { companyId: 'test-b7-company-' + Date.now() };

  const validHeaders = 'date,product,category,quantity,production_cost,selling_price,region,customer_type';

  beforeAll(async () => {
    await connectMongo();
  });

  afterAll(async () => {
    const db = getDb();
    await db.collection('business_data').deleteMany({ company_id: scope.companyId });
    await db.collection('financial_summaries').deleteMany({ company_id: scope.companyId });
    await closeMongo();
  });

  // (a) UTF-8 with BOM stripped
  it('(a) strips UTF-8 BOM (utf-8-sig) transparently and imports records', async () => {
    const csvContent = '\uFEFF' + [
      validHeaders,
      '2026-03-01,BOM Shirt,Apparel,15,100,200,North,Retail',
    ].join('\n');

    const result = await UploadService.csvUpload(scope, Buffer.from(csvContent, 'utf-8'), 'bom_test.csv');
    expect(result.created).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  // (b) CRLF and LF both accepted
  it('(b) accepts both CRLF (\\r\\n) and LF (\\n) line endings identically', async () => {
    const crlfCsv = [
      validHeaders,
      '2026-03-02,CRLF Item 1,Goods,5,50,100,South,Retail',
      '2026-03-03,CRLF Item 2,Goods,10,60,120,South,Wholesale',
    ].join('\r\n');

    const result = await UploadService.csvUpload(scope, Buffer.from(crlfCsv, 'utf-8'), 'crlf_test.csv');
    expect(result.created).toBe(2);
    expect(result.warnings).toHaveLength(0);
  });

  // (c) Header-only file: 400 "CSV file contains no data rows."
  it('(c) rejects header-only file with 400 "CSV file contains no data rows."', async () => {
    const headerOnly = validHeaders + '\n';
    await expect(
      UploadService.csvUpload(scope, Buffer.from(headerOnly, 'utf-8'), 'header_only.csv')
    ).rejects.toThrow(/CSV file contains no data rows/i);
  });

  // (d) Empty file: 400 "CSV file is empty."
  it('(d) rejects empty file with 400 "CSV file is empty."', async () => {
    await expect(
      UploadService.csvUpload(scope, Buffer.from(''), 'empty.csv')
    ).rejects.toThrow(/CSV file is empty/i);

    await expect(
      UploadService.csvUpload(scope, Buffer.from('   \n  \t  '), 'whitespace.csv')
    ).rejects.toThrow(/CSV file is empty/i);
  });

  // (e) Negative numbers in numeric columns: 400 with row and column named
  it('(e) rejects negative numbers in numeric columns with 400 naming row and column', async () => {
    const negQtyCsv = [
      validHeaders,
      '2026-03-01,Valid Item,Goods,10,50,100,East,Retail',
      '2026-03-02,Bad Item,Goods,-15,50,100,East,Retail',
    ].join('\n');

    await expect(
      UploadService.csvUpload(scope, Buffer.from(negQtyCsv, 'utf-8'), 'neg_qty.csv')
    ).rejects.toThrow(/Row 2.*quantity.*negative/i);

    const negCostCsv = [
      validHeaders,
      '2026-03-01,Bad Cost Item,Goods,10,-50,100,East,Retail',
    ].join('\n');

    await expect(
      UploadService.csvUpload(scope, Buffer.from(negCostCsv, 'utf-8'), 'neg_cost.csv')
    ).rejects.toThrow(/Row 1.*production_cost.*negative/i);
  });

  // (f) Partial success: if row 3 of 5 is invalid, insert 4 and report errors in warnings
  it('(f) partial success: inserts 4 valid records and reports warning for row 3, matching Django', async () => {
    const partialCsv = [
      validHeaders,
      '2026-03-01,Row 1,Goods,10,50,100,North,Retail',
      '2026-03-02,Row 2,Goods,10,50,100,North,Retail',
      'NOT-A-DATE,Row 3 Bad Date,Goods,10,50,100,North,Retail',
      '2026-03-04,Row 4,Goods,10,50,100,North,Retail',
      '2026-03-05,Row 5,Goods,10,50,100,North,Retail',
    ].join('\n');

    const result = await UploadService.csvUpload(scope, Buffer.from(partialCsv, 'utf-8'), 'partial.csv');
    expect(result.created).toBe(4);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].row).toBe(3);
    expect(result.warnings[0].detail).toMatch(/Invalid date/i);
  });

  // (g) Max rows per file cap and file-size cap enforced
  it('(g) enforces row cap on oversized CSV files', async () => {
    const maxRows = 10000;
    const oversizedLines = [validHeaders];
    for (let i = 0; i < maxRows + 1; i++) {
      oversizedLines.push(`2026-03-01,Item ${i},Cat,1,10,20,North,Retail`);
    }
    const oversizedCsv = oversizedLines.join('\n');

    await expect(
      UploadService.csvUpload(scope, Buffer.from(oversizedCsv, 'utf-8'), 'oversized.csv')
    ).rejects.toThrow(/exceeds maximum.*row/i);
  });
});
