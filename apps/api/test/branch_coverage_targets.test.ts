import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import { ObjectId, type Document } from 'mongodb';
import { WebSocket } from 'ws';
import { connectMongo, closeMongo, getDb, getCollection, getClient } from '../src/db/mongo.js';
import { HealthRepository } from '../src/modules/health/health.repository.js';
import { BillsRepository, type BillDoc } from '../src/modules/bills/bills.repository.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { WorkersRepository, type WorkerDoc } from '../src/modules/workers/workers.repository.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InsightsRepository } from '../src/modules/insights/insights.repository.js';
import { InsightsService } from '../src/modules/insights/insights.service.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { StorageService, validateStoragePath, getMimeType, GridFSStorageDriver } from '../src/modules/upload/storage.service.js';
import { UploadService } from '../src/modules/upload/upload.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import * as redisModule from '../src/db/redis.js';
import { setupWebSocketGateway, closeWebSockets, wsEvents } from '../src/ws/gateway.js';
import { generateTokens, signAccessToken } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';
import { ValidationError, NotFoundError, BadRequestError } from '../src/utils/errors.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('Branch Coverage Target Exhaustion Suite', () => {
  const companyId = 'bct-' + Date.now();
  const scope: TenantScope = { companyId, company_id: companyId };
  let db: any;
  let testUserId: ObjectId;
  let validToken: string;
  let otherCompanyToken: string;

  beforeAll(async () => {
    db = await connectMongo();

    // Seed test company and user for auth checks
    const compObjId = new ObjectId();
    await db.collection('company').insertOne({
      _id: compObjId,
      company_id: companyId,
      name: 'Branch Targets Corp',
    });

    testUserId = new ObjectId();
    const email = `bct_user_${Date.now()}@example.com`;
    await db.collection('user').insertOne({
      _id: testUserId,
      email,
      name: 'Branch Tester',
      password: hashPassword('password123'),
      company: compObjId,
    });

    const tokens = generateTokens({ _id: testUserId, email, name: 'Branch Tester' }, companyId);
    validToken = tokens.access;

    const otherTokens = generateTokens({ _id: new ObjectId(), email: 'other@example.com', name: 'Other' }, 'other-comp-999');
    otherCompanyToken = otherTokens.access;
  });

  afterAll(async () => {
    if (db) {
      await db.collection('company').deleteMany({ company_id: { $regex: /^bct-/ } });
      await db.collection('user').deleteMany({ company_id: { $regex: /^bct-/ } });
      await db.collection('bills').deleteMany({ company_id: companyId });
      await db.collection('inventory_items').deleteMany({ company_id: companyId });
      await db.collection('warehouses').deleteMany({ company_id: companyId });
      await db.collection('workers').deleteMany({ company_id: companyId });
      await db.collection('material_assignments').deleteMany({ company_id: companyId });
      await db.collection('pay_records').deleteMany({ company_id: companyId });
      await db.collection('insights').deleteMany({ company_id: companyId });
      await db.collection('business_data').deleteMany({ company_id: companyId });
      await db.collection('financial_summaries').deleteMany({ company_id: companyId });
      await db.collection('counters').deleteMany({ _id: { $regex: new RegExp(companyId) } });
    }
    await closeMongo();
  });

  describe('1. HealthRepository Branches', () => {
    it('exhausts checkMongo and pingMongo branches including error path', async () => {
      const upCheck = await HealthRepository.checkMongo();
      expect(upCheck.status).toBe('up');
      expect(upCheck.latency_ms).toBeGreaterThanOrEqual(0);
      expect(upCheck.pool.maxPoolSize).toBeGreaterThan(0);

      const isUp = await HealthRepository.pingMongo();
      expect(isUp).toBe(true);

      // Force failure on db.command
      const origDb = getDb();
      const origCommand = origDb.command.bind(origDb);
      origDb.command = async () => { throw new Error('Simulated mongo ping failure'); };

      try {
        const downCheck = await HealthRepository.checkMongo();
        expect(downCheck.status).toBe('down');
        expect(downCheck.latency_ms).toBe(-1);

        const isDown = await HealthRepository.pingMongo();
        expect(isDown).toBe(false);
      } finally {
        origDb.command = origCommand;
      }
    });

    it('exhausts checkRedis branches when disabled or erroring', async () => {
      const redisCheck = await HealthRepository.checkRedis();
      expect(['disabled', 'up', 'down']).toContain(redisCheck.status);
    });
  });

  describe('2. BillsRepository Branches', () => {
    it('covers getNextInvoiceNumber forceResync, resync with last bill, and counter updates', async () => {
      const num1 = await BillsRepository.getNextInvoiceNumber(scope, true);
      expect(num1).toMatch(/^INV-\d{4}-\d{5}$/);

      // Insert a bill with custom higher invoice number
      const year = new Date().getFullYear();
      await db.collection('bills').insertOne({
        company_id: companyId,
        bill_type: 'pakka',
        invoice_number: `INV-${year}-00099`,
        created_at: new Date(),
      });

      // Next number without forceResync detects higher bill and bumps
      const num2 = await BillsRepository.getNextInvoiceNumber(scope, false);
      expect(num2).toBe(`INV-${year}-00100`);

      // forceResync again
      const num3 = await BillsRepository.getNextInvoiceNumber(scope, true);
      expect(num3).toBe(`INV-${year}-00101`);
    });

    it('covers insertBillWithRetry duplicate collision retry and exhaustion', async () => {
      let attempts = 0;
      const doc = await BillsRepository.insertBillWithRetry(scope, (inv) => {
        attempts++;
        return {
          bill_type: 'pakka',
          subtotal: 100,
          grand_total: 100,
        };
      }, 3);
      expect(doc._id).toBeDefined();

      // Test duplicate key error rejection after max attempts
      const realDb = getDb();
      const origCollection = realDb.collection.bind(realDb);
      const err = new Error('E11000 duplicate key error collection');
      (err as any).code = 11000;
      realDb.collection = ((name: string, options: any) => {
        const col = origCollection(name, options);
        if (name === 'bills') {
          col.insertOne = (async () => { throw err; }) as any;
        }
        return col;
      }) as any;

      try {
        await expect(BillsRepository.insertBillWithRetry(scope, () => ({
          bill_type: 'pakka',
          subtotal: 50,
          grand_total: 50,
        }), 2)).rejects.toThrow('Could not generate a unique invoice number, please retry.');
      } finally {
        realDb.collection = origCollection;
      }
    });

    it('covers conditional inventory stock adjustments and linked assignments queries', async () => {
      const itemRes = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        name: 'Stock Check Item',
        quantity: 10,
        selling_price: 100,
        cost_price: 50,
      });
      const itemId = itemRes.insertedId;

      // Conditional decrement when stock >= 5 (should succeed)
      const ok = await BillsRepository.adjustInventoryStockConditional(scope, itemId, -5, 5);
      expect(ok).toBe(true);

      // Conditional decrement when stock >= 10 (should fail as stock is now 5)
      const fail = await BillsRepository.adjustInventoryStockConditional(scope, itemId, -5, 10);
      expect(fail).toBe(false);

      // Unconditional adjust with string id
      const ok2 = await BillsRepository.adjustInventoryStockById(scope, itemId.toString(), 2);
      expect(ok2).toBe(true);

      // findInventoryItemById with string id
      const itemDoc = await BillsRepository.findInventoryItemById(scope, itemId.toString());
      expect(itemDoc).toBeDefined();
      expect(itemDoc?._id.toString()).toBe(itemId.toString());

      // findLinkedPayRecordsForBills with empty assignments array
      const linked = await BillsRepository.findLinkedPayRecordsForBills(scope, ['fake-bill-1'], []);
      expect(linked).toEqual([]);

      // findLinkedAssignments
      const assigns = await BillsRepository.findLinkedAssignments(scope, 'fake-bill-1');
      expect(assigns).toEqual([]);

      // findLinkedAssignmentsForBills
      const assignsBatch = await BillsRepository.findLinkedAssignmentsForBills(scope, ['fake-bill-1']);
      expect(assignsBatch).toEqual([]);

      // Raw update bill and find by id string
      const bRes = await db.collection('bills').insertOne({
        company_id: companyId,
        bill_type: 'pakka',
        subtotal: 200,
      });
      const updated = await BillsRepository.updateBillRaw(scope, bRes.insertedId.toString(), { $set: { subtotal: 300 } });
      expect(updated?.subtotal).toBe(300);

      const found = await BillsRepository.findBillById(scope, bRes.insertedId.toString());
      expect(found?.subtotal).toBe(300);

      const deleted = await BillsRepository.deleteBill(scope, bRes.insertedId.toString());
      expect(deleted).toBe(true);
    });
  });

  describe('3. BillsService Workflow Edge Branches', () => {
    it('covers validation errors, stock deductions, costs, and profit lifecycle', async () => {
      // 1. Validation on create: missing products, missing buyer name
      await expect(BillsService.createBill(scope, 'pakka', {
        buyer: { name: '' },
        products: [],
      })).rejects.toThrow(ValidationError);

      await expect(BillsService.createBill(scope, 'pakka', {
        buyer: { name: 'Valid Buyer' },
        products: [],
      })).rejects.toThrow('At least one product is required.');

      // 2. Create inventory items to verify stock adjustments
      const invItem1 = await InventoryService.createItem(scope, 'finished', {
        name: 'Bill Edge Item 1',
        quantity: 20,
        selling_price: 100,
      });

      const bill = await BillsService.createBill(scope, 'pakka', {
        workflow: 'legacy' as any,
        buyer: { name: 'Acme Buyer', phone: '9876543210', gst_number: '29ABCDE1234F1Z5' },
        products: [
          { name: 'Bill Edge Item 1', quantity: 5, rate: 100, unit: 'pcs', inventory_item_id: invItem1.id },
        ],
        subtotal: 500,
        discount: 50,
        gst_percentage: 18,
      });
      expect(bill.invoice_number).toMatch(/^INV-/);

      // Stock should have decreased to 15
      const itemAfter = await InventoryRepository.findItemById(scope, invItem1.id);
      expect(itemAfter?.quantity).toBe(15);

      // 3. Update bill: increase quantity to 10 (decrements 5 more stock)
      const updatedBill = await BillsService.updateBill(scope, bill.id, {
        products: [
          { name: 'Bill Edge Item 1', quantity: 10, rate: 100, unit: 'pcs', inventory_item_id: invItem1.id },
        ],
        subtotal: 1000,
      });
      expect(updatedBill.subtotal).toBe(1000);
      const itemAfterInc = await InventoryRepository.findItemById(scope, invItem1.id);
      expect(itemAfterInc?.quantity).toBe(10);

      // 4. Update bill: decrease quantity to 4 (returns 6 stock)
      await BillsService.updateBill(scope, bill.id, {
        products: [
          { name: 'Bill Edge Item 1', quantity: 4, rate: 100, unit: 'pcs', inventory_item_id: invItem1.id },
        ],
        subtotal: 400,
      });
      const itemAfterDec = await InventoryRepository.findItemById(scope, invItem1.id);
      expect(itemAfterDec?.quantity).toBe(16);

      // 5. Costs: transportation and misc
      await expect(BillsService.addTransportationCost(scope, bill.id, { amount: -10 })).rejects.toThrow('Amount must be positive.');
      const bWithTrans = await BillsService.addTransportationCost(scope, bill.id, { amount: 150, notes: 'Express freight' });
      expect(bWithTrans.transportation_costs?.length).toBe(1);

      await expect(BillsService.addMiscCost(scope, bill.id, { amount: 0 })).rejects.toThrow('Amount must be positive.');
      const bWithMisc = await BillsService.addMiscCost(scope, bill.id, { amount: 75, notes: 'Packaging' });
      expect(bWithMisc.misc_costs?.length).toBe(1);

      // 6. Profit lifecycle: suggested, confirm with override, reopen
      const suggestion = await BillsService.getProfitPreview(scope, bill.id);
      expect(suggestion.suggested_profit).toBeDefined();

      // Confirm profit with NaN override (falls back to suggested)
      const confirmedWithNan = await BillsService.confirmProfit(scope, bill.id, NaN);
      expect(confirmedWithNan.profit_confirmed).toBe(true);

      // Valid override amount
      const confirmedBill = await BillsService.confirmProfit(scope, bill.id, 350);
      expect(confirmedBill.profit_confirmed).toBe(true);
      expect(confirmedBill.profit_confirmed_amount).toBe(350);

      // Reopen profit
      const reopenedBill = await BillsService.reopenProfit(scope, bill.id);
      expect(reopenedBill.profit_confirmed).toBe(false);
      expect(reopenedBill.profit_confirmed_amount).toBeNull();

      // Delete bill restores stock (16 + 4 = 20)
      await BillsService.deleteBill(scope, bill.id);
      const itemFinal = await InventoryRepository.findItemById(scope, invItem1.id);
      expect(itemFinal?.quantity).toBe(20);
    });
  });

  describe('4. InventoryRepository & WorkersRepository Branches', () => {
    it('covers getNextSku forceResync, warehouse queries, and syncFinishedInventory', async () => {
      // Sku force resync
      const sku1 = await InventoryRepository.getNextSku(scope, true);
      expect(sku1).toMatch(/^SKU-\d{5}$/);

      // Warehouses by IDs
      const wh1 = await InventoryRepository.insertWarehouse(scope, { name: 'Batch WH 1' });
      const wh2 = await InventoryRepository.insertWarehouse(scope, { name: 'Batch WH 2' });
      const whs = await InventoryRepository.findWarehousesByIds(scope, [wh1._id.toString(), wh2._id]);
      expect(whs.length).toBe(2);

      // WorkersRepository.syncFinishedInventory: empty name / 0 quantity do nothing
      await WorkersRepository.syncFinishedInventory(scope, '', 10);
      await WorkersRepository.syncFinishedInventory(scope, 'Valid Item', 0);

      // syncFinishedInventory creates new finished item
      const syncName = 'Synced Finished Coat';
      await WorkersRepository.syncFinishedInventory(scope, syncName, 15);
      const synced = await db.collection('inventory_items').findOne({ company_id: companyId, name: syncName });
      expect(synced).toBeDefined();
      expect(synced.quantity).toBe(15);

      // syncFinishedInventory increments existing item
      await WorkersRepository.syncFinishedInventory(scope, syncName, 10);
      const synced2 = await db.collection('inventory_items').findOne({ company_id: companyId, name: syncName });
      expect(synced2.quantity).toBe(25);

      // WorkersRepository aggregation summaries
      const w1 = await WorkersRepository.insertWorker(scope, { name: 'Worker Alpha', is_active: true });
      const sums = await WorkersRepository.aggregateWorkerAssignmentSummaries(scope);
      expect(Array.isArray(sums)).toBe(true);

      const sumsWithIds = await WorkersRepository.aggregateWorkerAssignmentSummaries(scope, [w1._id]);
      expect(Array.isArray(sumsWithIds)).toBe(true);

      const paySums = await WorkersRepository.aggregateWorkerPaymentSummaries(scope);
      expect(Array.isArray(paySums)).toBe(true);

      const paySumsWithIds = await WorkersRepository.aggregateWorkerPaymentSummaries(scope, [w1._id]);
      expect(Array.isArray(paySumsWithIds)).toBe(true);
    });
  });

  describe('5. AiService & InsightsService Branches', () => {
    it('covers AiService configuration, insight types, and command intents', async () => {
      const cfg = AiService.getConfig();
      expect(cfg.websocket_path).toBe('/ws/ai-assistant/');
      expect(cfg.starter_prompts.length).toBeGreaterThan(0);

      // Seed business data for insight queries
      await db.collection('business_data').insertOne({
        company_id: companyId,
        date: new Date(),
        product: 'AI Test Product',
        category: 'Test',
        quantity: 10,
        production_cost: 20,
        selling_price: 50,
      });

      const revData = await AiService.getInsightData(scope, 'revenue_trends');
      expect(Array.isArray(revData)).toBe(true);

      const profitData = await AiService.getInsightData(scope, 'profit_analysis');
      expect(Array.isArray(profitData)).toBe(true);

      const workerPerf = await AiService.getInsightData(scope, 'worker_performance');
      expect(Array.isArray(workerPerf)).toBe(true);

      const unknownData = await AiService.getInsightData(scope, 'non_existent_insight');
      expect(unknownData).toEqual([]);

      // Process AI Commands: Exports
      const resExpBiz = await AiService.processAiCommand(scope, 'user@test.com', 'Export business trends');
      expect(resExpBiz.action).toBe('download');

      const resExpWorkers = await AiService.processAiCommand(scope, 'user@test.com', 'Export worker management report');
      expect(resExpWorkers.action).toBe('download');

      const resExpSalary = await AiService.processAiCommand(scope, 'user@test.com', 'Export salary payroll');
      expect(resExpSalary.action).toBe('download');

      const resExpAll = await AiService.processAiCommand(scope, 'user@test.com', 'Export complete analytics');
      expect(resExpAll.action).toBe('download');

      const resExpVague = await AiService.processAiCommand(scope, 'user@test.com', 'Export');
      expect(resExpVague.action).toBe('message');

      // Navigation commands
      const resNavDash = await AiService.processAiCommand(scope, 'user@test.com', 'Go to dashboard overview');
      expect(resNavDash.action).toBe('navigate');
      expect(resNavDash.url).toBe('/dashboard');

      const resNavIns = await AiService.processAiCommand(scope, 'user@test.com', 'Show me insights analysis');
      expect(resNavIns.action).toBe('navigate');

      const resNavUp = await AiService.processAiCommand(scope, 'user@test.com', 'Go to upload data');
      expect(resNavUp.action).toBe('navigate');

      const resNavW = await AiService.processAiCommand(scope, 'user@test.com', 'Workers list');
      expect(resNavW.action).toBe('navigate');

      const resNavBills = await AiService.processAiCommand(scope, 'user@test.com', 'View bills invoice');
      expect(resNavBills.action).toBe('navigate');

      const resNavInv = await AiService.processAiCommand(scope, 'user@test.com', 'Check inventory stock');
      expect(resNavInv.action).toBe('navigate');

      // Display commands
      const resShowRev = await AiService.processAiCommand(scope, 'user@test.com', 'Show revenue income');
      expect(resShowRev.action).toBe('display');

      const resShowProfit = await AiService.processAiCommand(scope, 'user@test.com', 'Display profit margin');
      expect(resShowProfit.action).toBe('display');

      const resShowProd = await AiService.processAiCommand(scope, 'user@test.com', 'Show worker productivity');
      expect(resShowProd.action).toBe('display');

      const resShowUnknown = await AiService.processAiCommand(scope, 'user@test.com', 'Show me something random');
      expect(resShowUnknown.action).toBe('message');

      // Default unmatched command
      const resGreeting = await AiService.processAiCommand(scope, 'user@test.com', 'Hello there');
      expect(resGreeting.action).toBe('message');
    });

    it('covers InsightsService CRUD, generation and export', async () => {
      const insight = await InsightsRepository.insertInsight(scope, {
        title: 'High Growth Insight',
        description: 'Revenue exceeded expectations by 40% this quarter.',
        labels: ['growth', 'revenue'],
        data_points: [100, 150, 200],
        note: 'Quarterly review',
        created_at: new Date(),
      });
      expect(insight._id).toBeDefined();

      const all = await InsightsService.listInsights(scope);
      expect(all.length).toBeGreaterThan(0);

      const exportedCsv = await InsightsService.exportInsight(scope, insight._id.toString());
      expect(exportedCsv).toContain('High Growth Insight');
      expect(exportedCsv).toContain('Period,Value');

      await InsightsService.deleteInsight(scope, insight._id.toString());

      await expect(InsightsService.deleteInsight(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await expect(InsightsService.exportInsight(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
    });
  });

  describe('6. DashboardService & StorageService Branches', () => {
    it('covers DashboardService export types and financial trends', async () => {
      // Seed pay record and worker for export test
      const w = await WorkersRepository.insertWorker(scope, { name: 'Export Worker', phone: '9988776655', is_active: true });
      await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker: w._id,
        worker_id: w._id.toString(),
        product_name: 'Stitched Kurti',
        units_produced: 20,
        rate_per_unit: 100,
        amount_paid: 2000,
        paid: true,
        date: new Date(),
      });

      const url1 = await DashboardService.generateExportFile(scope, 'business_trends');
      expect(url1).toContain('.csv');

      const url2 = await DashboardService.generateExportFile(scope, 'worker_management');
      expect(url2).toContain('.csv');

      const url3 = await DashboardService.generateExportFile(scope, 'salary_payments');
      expect(url3).toContain('.csv');

      const url4 = await DashboardService.generateExportFile(scope, 'complete_analytics');
      expect(url4).toContain('.csv');

      const data = await DashboardService.getDashboardData(scope);
      expect(data.summary).toBeDefined();

      const quarterlyTrends = await DashboardService.getProfitTrends(scope, 6, 'quarterly');
      expect(quarterlyTrends.labels).toBeDefined();
      expect(Array.isArray(quarterlyTrends.profit)).toBe(true);

      const monthlyTrends = await DashboardService.getProfitTrends(scope, 6, 'monthly');
      expect(monthlyTrends.labels).toBeDefined();
      expect(Array.isArray(monthlyTrends.profit)).toBe(true);
    });

    it('covers storage path validation, mime types, and driver read/exists', async () => {
      // Path traversal rejections
      expect(() => validateStoragePath('')).toThrow(BadRequestError);
      expect(() => validateStoragePath('../secret')).toThrow(BadRequestError);
      expect(() => validateStoragePath('dir/\0null')).toThrow(BadRequestError);
      expect(() => validateStoragePath('dir\\win')).toThrow(BadRequestError);
      expect(() => validateStoragePath('/abs/path')).toThrow(BadRequestError);

      // MIME types
      expect(getMimeType('test.png')).toBe('image/png');
      expect(getMimeType('test.jpg')).toBe('image/jpeg');
      expect(getMimeType('test.svg')).toBe('image/svg+xml');
      expect(getMimeType('test.pdf')).toBe('application/pdf');
      expect(getMimeType('test.csv')).toBe('text/csv');
      expect(getMimeType('test.json')).toBe('application/json');
      expect(getMimeType('test.unknown')).toBe('application/octet-stream');

      // GridFS driver operations
      const driver = new GridFSStorageDriver();
      const nonExistent = await driver.read('does_not_exist.txt');
      expect(nonExistent).toBeNull();

      const exists = await driver.exists('does_not_exist.txt');
      expect(exists).toBe(false);

      const deleted = await driver.delete('does_not_exist.txt');
      expect(deleted).toBe(false);
    });

    it('covers UploadService CSV validation errors and formula injection detection', async () => {
      // Path traversal filename
      await expect(UploadService.csvUpload(scope, Buffer.from('a,b'), '../test.csv')).rejects.toThrow('Invalid or insecure filename.');

      // Non-csv extension
      await expect(UploadService.csvUpload(scope, Buffer.from('a,b'), 'test.xlsx')).rejects.toThrow('Please upload a valid CSV file.');

      // Empty buffer
      await expect(UploadService.csvUpload(scope, Buffer.alloc(0), 'empty.csv')).rejects.toThrow('Missing required columns.');

      // BOM empty
      await expect(UploadService.csvUpload(scope, Buffer.from('\uFEFF   '), 'bom_empty.csv')).rejects.toThrow('Missing required columns.');

      // Header-only csv (accepted with 0 rows matching Django)
      const headerOnly = Buffer.from('date,product,quantity,production_cost,selling_price,region,customer_type\n');
      const headerRes = await UploadService.csvUpload(scope, headerOnly, 'header.csv');
      expect(headerRes.created).toBe(0);

      // Missing columns
      const missingCols = Buffer.from('date,product\n2026-10-15,Bolt\n');
      await expect(UploadService.csvUpload(scope, missingCols, 'missing.csv')).rejects.toThrow(/Missing required columns/);

      // Signed values (accepted matching Django)
      const negVal = Buffer.from('date,product,quantity,production_cost,selling_price,region,customer_type\n2026-10-15,Bolt,-10,5,10,North,Retail\n');
      const negRes = await UploadService.csvUpload(scope, negVal, 'neg.csv');
      expect(negRes.created).toBe(1);

      // Formula injection
      const formulaInjection = Buffer.from('date,product,quantity,production_cost,selling_price,region,customer_type\n2026-10-15,Bolt,=10+5,5,10,North,Retail\n');
      await expect(UploadService.csvUpload(scope, formulaInjection, 'formula.csv')).rejects.toThrow(/disallowed formula expression|Formula injection/);

      // Manual upload validation errors
      await expect(UploadService.manualUpload(scope, {} as any)).rejects.toThrow('Missing required fields.');
      await expect(UploadService.manualUpload(scope, {
        date: 'invalid-date',
        product: 'Prod',
        quantity: 1,
        production_cost: 1,
        selling_price: 2,
      })).rejects.toThrow('Invalid date format. Expected YYYY-MM-DD.');
    });
  });

  describe('7. WebSocket Gateway Branches', () => {
    let server: http.Server;
    let wsPort: number;

    beforeAll(async () => {
      server = http.createServer();
      setupWebSocketGateway(server);

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            wsPort = addr.port;
          }
          resolve();
        });
      });
    });

    afterAll(async () => {
      closeWebSockets();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it('rejects upgrade requests to unknown WebSocket paths', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/unknown/`);
      const errorOrClose = await new Promise<number | Error>((resolve) => {
        ws.on('error', (err) => resolve(err));
        ws.on('close', (code) => resolve(code));
      });
      expect(errorOrClose).toBeDefined();
    });

    it('rejects dashboard connection when token is missing', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/dashboard/${companyId}/`);
      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });
      expect(closeCode).toBe(4001);
    });

    it('rejects dashboard connection when token is invalid', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/dashboard/${companyId}/?token=invalid.jwt.token`);
      const closeCode = await new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
      });
      expect(closeCode).toBe(4001);
    });

    it('rejects dashboard connection when companyId does not match token companyId', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/dashboard/wrong-company-id/?token=${validToken}`);
      const { code, reason } = await new Promise<{ code: number; reason: string }>((resolve) => {
        ws.on('close', (c, r) => resolve({ code: c, reason: r.toString() }));
      });
      expect(code).toBe(4001);
      expect(reason).toBe('Cross-company dashboard access forbidden');
    });

    it('successfully connects to dashboard and receives initial snapshot and live update', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/dashboard/${companyId}/?token=${validToken}`);

      const firstMessage = await new Promise<any>((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      });
      expect(firstMessage.summary).toBeDefined();

      // Trigger live update event with custom data
      const updatePromise = new Promise<any>((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      });
      wsEvents.emit('dashboard.update', { companyId, data: { live: true } });
      const liveMsg = await updatePromise;
      expect(liveMsg.live).toBe(true);

      // Trigger live update event without data (triggers fresh fetch)
      const freshPromise = new Promise<any>((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      });
      wsEvents.emit('dashboard.update', { companyId });
      const freshMsg = await freshPromise;
      expect(freshMsg.summary).toBeDefined();

      ws.close();
    });

    it('handles AI Assistant unauthenticated connection, first-message auth, and command dispatch', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/ai-assistant/`);

      // 1. Initial status frame: unauthenticated
      const initialStatus = await new Promise<any>((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      });
      expect(initialStatus.type).toBe('session_status');
      expect(initialStatus.authenticated).toBe(false);

      // 2. Send command without auth -> error
      const unauthErrPromise = new Promise<any>((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      });
      ws.send(JSON.stringify({ command: 'help' }));
      const unauthErr = await unauthErrPromise;
      expect(unauthErr.type).toBe('error');
      expect(unauthErr.content).toBe('Authentication required.');

      // 3. Authenticate with valid token in message
      const authStatusPromise = new Promise<any>((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      });
      ws.send(JSON.stringify({ token: validToken }));
      const authStatus = await authStatusPromise;
      expect(authStatus.type).toBe('session_status');
      expect(authStatus.authenticated).toBe(true);

      // 4. Send command now that we are authenticated
      const cmdResponsePromise = new Promise<any>((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      });
      ws.send(JSON.stringify({ command: 'Go to dashboard' }));
      const cmdRes = await cmdResponsePromise;
      expect(cmdRes.action).toBe('navigate');
      expect(cmdRes.url).toBe('/dashboard');

      ws.close();
    });

    it('handles AI Assistant authorization header, invalid token, message parse error and closeWebSockets', async () => {
      // 1. Authorization header with invalid token
      const wsInv = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/ai-assistant/`, {
        headers: { Authorization: 'Bearer bad.token.here' },
      });
      const invClose = await new Promise<number>((resolve) => {
        wsInv.on('close', (code) => resolve(code));
      });
      expect(invClose).toBe(4001);

      // 2. Authorization header with valid token
      const wsAuth = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/ai-assistant/`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const authStatus = await new Promise<any>((resolve) => {
        wsAuth.once('message', (d) => resolve(JSON.parse(d.toString())));
      });
      expect(authStatus.type).toBe('session_status');
      expect(authStatus.authenticated).toBe(true);

      // Send invalid JSON
      const errPromise = new Promise<any>((resolve) => {
        wsAuth.once('message', (d) => resolve(JSON.parse(d.toString())));
      });
      wsAuth.send('not valid json');
      const errRes = await errPromise;
      expect(errRes.type).toBe('error');

      // Test closeWebSockets
      closeWebSockets(1001, 'Testing shutdown');
      wsAuth.close();
    });
  });

  describe('8. AuthService Edge Branches', () => {
    it('covers user login with string company, company_id string, and google login edge cases', async () => {
      const compUuid = 'comp-str-' + Date.now();
      const emailStr = `strcomp_${Date.now()}@example.com`;
      const compOnlyId = 'comp-only-' + Date.now();
      const emailOnly = `onlyid_${Date.now()}@example.com`;

      try {
        await db.collection('company').insertOne({
          company_id: compUuid,
          name: 'String Company Corp',
        });
        await db.collection('user').insertOne({
          email: emailStr,
          password: hashPassword('Pass123!'),
          name: 'String Comp User',
          company: compUuid,
          company_id: compUuid,
        });
        const res1 = await AuthService.login({ email: emailStr, password: 'Pass123!' });
        expect(res1.user.company_name).toBe('String Company Corp');

        await db.collection('company').insertOne({
          company_id: compOnlyId,
          name: 'Only ID Corp',
        });
        await db.collection('user').insertOne({
          email: emailOnly,
          password: hashPassword('Pass123!'),
          name: 'Only Id User',
          company_id: compOnlyId,
        });
        const res2 = await AuthService.login({ email: emailOnly, password: 'Pass123!' });
        expect(res2.user.company_id).toBe(compOnlyId);

        // Google login validation: missing credential / id_token
        await expect(AuthService.googleLogin({})).rejects.toThrow('Missing Google credential.');
      } finally {
        await db.collection('user').deleteMany({ email: { $in: [emailStr, emailOnly] } });
        await db.collection('company').deleteMany({ company_id: { $in: [compUuid, compOnlyId] } });
      }
    });
  });

  describe('9. ObjectId Invariant Branches Across Repositories', () => {
    it('exercises ObjectId vs string branches across BillsRepository, InventoryRepository, WorkersRepository, InsightsRepository and Health', async () => {
      const dummyId = new ObjectId();

      // BillsRepository
      expect(await BillsRepository.findBillById(scope, dummyId)).toBeNull();
      expect(await BillsRepository.updateBill(scope, dummyId, { bill_type: 'kacha' })).toBeNull();
      expect(await BillsRepository.updateBillRaw(scope, dummyId, { $set: { notes: 'x' } })).toBeNull();
      expect(await BillsRepository.deleteBill(scope, dummyId)).toBe(false);
      expect(await BillsRepository.findInventoryItemById(scope, dummyId)).toBeNull();
      expect(await BillsRepository.adjustInventoryStockById(scope, dummyId, 1)).toBe(false);
      expect(await BillsRepository.adjustInventoryStockConditional(scope, dummyId, 1, 100)).toBe(false);
      expect(await BillsRepository.findLinkedPayRecordsForBills(scope, ['nonexistent'], [])).toEqual([]);
      expect(await BillsRepository.findLinkedPayRecordsForBills(scope, ['nonexistent'], ['some-id'])).toEqual([]);

      // InventoryRepository
      expect(await InventoryRepository.findItemById(scope, dummyId)).toBeNull();
      expect(await InventoryRepository.updateItem(scope, dummyId, { name: 'n' })).toBeNull();
      expect(await InventoryRepository.deleteItem(scope, dummyId)).toBe(false);
      expect(await InventoryRepository.findWarehouseById(scope, dummyId)).toBeNull();
      expect(await InventoryRepository.updateWarehouse(scope, dummyId, { name: 'wh' })).toBeNull();
      expect(await InventoryRepository.deleteWarehouse(scope, dummyId)).toBe(false);
      expect(await InventoryRepository.findBillById(scope, dummyId)).toBeNull();
      expect(await InventoryRepository.findWarehousesByIds(scope, [dummyId])).toEqual([]);
      expect(await InventoryRepository.findWorkersByIds(scope, [dummyId])).toEqual([]);

      // WorkersRepository
      expect(await WorkersRepository.findWorkerById(scope, dummyId)).toBeNull();
      expect(await WorkersRepository.updateWorker(scope, dummyId, { name: 'w' })).toBeNull();
      expect(await WorkersRepository.deleteWorker(scope, dummyId)).toBe(false);
      expect(await WorkersRepository.findAssignmentById(scope, dummyId)).toBeNull();
      expect(await WorkersRepository.updateAssignment(scope, dummyId, { status: 'open' })).toBeNull();
      expect(await WorkersRepository.addBatchToAssignment(scope, dummyId, { quantity: 1 })).toBeNull();
      expect(await WorkersRepository.findPaymentById(scope, dummyId)).toBeNull();
      expect(await WorkersRepository.updatePayment(scope, dummyId, { paid: true })).toBeNull();

      // WorkersRepository.syncFinishedInventory branches
      await WorkersRepository.syncFinishedInventory(scope, '', 10);
      await WorkersRepository.syncFinishedInventory(scope, 'Valid Item', 0);
      await WorkersRepository.syncFinishedInventory(scope, 'Non-existent item name', 10);

      // InsightsRepository
      expect(await InsightsRepository.findInsightById(scope, dummyId)).toBeNull();
      expect(await InsightsRepository.deleteInsight(scope, dummyId)).toBe(false);
      expect(await InsightsRepository.findInsights(scope, { title: 'Nonexistent Insight' })).toEqual([]);

      // HealthRepository Redis check with mocked client
      const spy = vi.spyOn(redisModule, 'getRedisClient').mockReturnValueOnce({
        ping: async () => 'PONG',
      } as any);
      const redisHealth = await HealthRepository.checkRedis();
      expect(redisHealth.status).toBe('up');
      expect(redisHealth.configured).toBe(true);
      spy.mockRestore();
    });
  });

  describe('10. Dashboard Export & Trends Edge Branches', () => {
    it('covers daily and weekly profit trends, worker payment statuses, and CSV export formats', async () => {
      // 1. Daily and weekly profit trends
      const dailyTrends = await DashboardService.getProfitTrends(scope, 1, 'daily');
      expect(dailyTrends.interval).toBe('daily');
      const weeklyTrends = await DashboardService.getProfitTrends(scope, 1, 'weekly');
      expect(weeklyTrends.interval).toBe('weekly');

      // 2. Worker payment status edge cases (partial, pending, paid, string worker, deleted worker)
      const workerCol = db.collection('workers');
      const payCol = db.collection('pay_records');
      const wRes = await workerCol.insertOne({
        company_id: companyId,
        name: 'Status Worker',
        phone: '9998887776',
        is_active: true,
      });

      await payCol.insertMany([
        {
          company_id: companyId,
          worker: wRes.insertedId,
          units_produced: 10,
          rate_per_unit: 10,
          amount_paid: 40, // Partial
          date: new Date(),
        },
        {
          company_id: companyId,
          worker: wRes.insertedId.toString(), // String ID
          units_produced: 10,
          rate_per_unit: 10,
          amount_paid: 0, // Pending
          paid: false,
          date: '2026-06-15T12:00:00Z', // String date
        },
        {
          company_id: companyId,
          worker: new ObjectId(), // Deleted worker
          units_produced: 5,
          rate_per_unit: 20,
          amount_paid: 100, // Paid
          paid: true,
          date: new Date(),
        },
      ]);

      const payments = await DashboardService.getWorkerPayments(scope);
      expect(payments.some((p) => p.status === 'Partial')).toBe(true);
      expect(payments.some((p) => p.status === 'Pending')).toBe(true);
      expect(payments.some((p) => p.status === 'Paid')).toBe(true);
      expect(payments.some((p) => p.name === 'Deleted Worker')).toBe(true);

      // 3. Export file types: business_trends, worker_management, salary_payments, complete_analytics
      await db.collection('business_data').insertOne({
        company_id: companyId,
        date: new Date(),
        product: 'Product, with "comma" & quotes',
        category: 'Cat A',
        quantity: 5,
        production_cost: 10,
        selling_price: 20,
        region: 'North',
        customer_type: 'B2B',
      });
      await db.collection('insights').insertOne({
        company_id: companyId,
        title: 'Dashboard Export Insight',
        description: 'A'.repeat(120), // > 100 chars
        created_at: new Date(),
      });
      await db.collection('financial_summaries').insertOne({
        company_id: companyId,
        timestamp: new Date(),
        total_revenue: 100,
        total_profit: 50,
        worker_payments: 20,
        active_workers: 1,
      });

      const export1 = await DashboardService.generateExportFile(scope, 'business_trends');
      expect(export1).toContain('business_trends');
      const export2 = await DashboardService.generateExportFile(scope, 'worker_management');
      expect(export2).toContain('worker_management');
      const export3 = await DashboardService.generateExportFile(scope, 'salary_payments');
      expect(export3).toContain('salary_payments');
      const export4 = await DashboardService.generateExportFile(scope, 'complete_analytics');
      expect(export4).toContain('complete_analytics');
    });
  });

  describe('11. UploadService Edge & Validation Branches', () => {
    it('covers empty business data summaries, manualUpload validation, and CSV row errors', async () => {
      // 1. generateFinancialSummaries on empty tenant
      const emptyScope: TenantScope = { companyId: 'empty-' + Date.now() };
      await UploadService.generateFinancialSummaries(emptyScope);

      // 2. manualUpload validation errors & optional fields
      await expect(
        UploadService.manualUpload(scope, {
          date: 'invalid-date-str',
          product: 'Prod',
          quantity: 1,
          production_cost: 1,
          selling_price: 2,
        })
      ).rejects.toThrow(BadRequestError);

      const manualRes = await UploadService.manualUpload(scope, {
        date: '2026-07-01',
        product: 'Manual Item',
        quantity: 10,
        production_cost: 5,
        selling_price: 15,
      });
      expect(manualRes.product).toBe('Manual Item');

      // 3. csvUpload with row-level validation errors (collected into warnings)
      const csvWithRowErrors = `date,product,quantity,production_cost,selling_price,region,customer_type
bad-date,Prod 1,10,5,10,North,B2B
2026-07-01,Prod 2,not-a-number,5,10,North,B2B
2026-07-01,Prod 3,10,not-a-cost,10,North,B2B
2026-07-01,Prod 4,10,5,not-a-price,North,B2B
2026-07-01,Prod 5,10,5,10,North,B2B
`;
      const uploadRes = await UploadService.csvUpload(scope, Buffer.from(csvWithRowErrors, 'utf8'), 'rows_with_errors.csv');
      expect(uploadRes.created).toBe(1);
      expect(uploadRes.warnings.length).toBe(4);
    });
  });

  describe('12. BillsService Serialization & Assignments Edge Branches', () => {
    it('covers getBillAssignments batches, wastage, over_returned, convertToPakka errors, and serialization edges', async () => {
      // 1. convertToPakka validations
      const pakkaBill = await BillsRepository.insertBill(scope, {
        bill_type: 'pakka',
        invoice_number: 'INV-PAKKA-001',
      } as any);

      await expect(BillsService.convertToPakka(scope, pakkaBill._id.toString(), { gst_number: '07AAAAA0000A1Z5' })).rejects.toThrow(
        'Bill is already a pakka (formal) bill.'
      );

      const kachaBill = await BillsRepository.insertBill(scope, {
        bill_type: 'kacha',
        invoice_number: 'INV-KACHA-002',
      } as any);

      await expect(BillsService.convertToPakka(scope, kachaBill._id.toString(), { gst_number: '' })).rejects.toThrow(
        'GST number is required to convert to pakka.'
      );

      // 2. getBillAssignments with batches, wastage, and over_returned
      const assignDoc = await WorkersRepository.insertAssignment(scope, {
        worker: new ObjectId(),
        material_name: 'Raw Silk',
        quantity: 10,
        price_per_unit: 50,
        assignment_date: new Date(),
        status: 'open',
        bill_id: kachaBill._id.toString(),
        wastage_quantity: 2,
        batches: [
          { quantity: 8, date: new Date().toISOString() },
          { quantity: 5, date: new Date().toISOString() }, // total delivered = 13 > 10 (over_returned)
        ],
      });

      const assignments = await BillsService.getBillAssignments(scope, kachaBill._id.toString());
      expect(assignments.length).toBeGreaterThanOrEqual(1);
      const found = assignments.find((a) => a.id === assignDoc._id.toString());
      expect(found).toBeDefined();
      expect(found?.over_returned).toBe(true);
      expect(found?.wastage_quantity).toBe(2);

      // 3. BillsService.serializeBill with buyer, costs, and payment variations
      const detailedBill = await BillsRepository.insertBill(scope, {
        bill_type: 'kacha',
        invoice_number: 'INV-DETAIL-003',
        grand_total: 1000,
        buyer: { name: 'Buyer A', address: '123 Main', gst_number: 'GST123', phone: '9998887776' },
        products: [
          { name: 'Detailed Product', quantity: 2, rate: 500, unit: 'box', description: 'Sample box' },
        ],
        transportation_costs: [{ amount: 50, notes: 'Truck freight' }],
        misc_costs: [{ amount: 25, notes: 'Handling' }],
        payments: [{ amount: 200, date: new Date(), notes: 'Advance' }],
      } as any);

      const serialized = await BillsService.getBill(scope, detailedBill._id.toString());
      expect(serialized.buyer.name).toBe('Buyer A');
      expect(serialized.products[0].unit).toBe('box');
    });
  });
});
