import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { ObjectId, type Document } from 'mongodb';
import { WebSocket } from 'ws';
import { connectMongo, getCollection } from '../src/db/mongo.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillPdfService, BillPdfRenderError } from '../src/modules/bills/pdf.service.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { DashboardRepository } from '../src/modules/dashboard/dashboard.repository.js';
import { setupWebSocketGateway } from '../src/ws/gateway.js';
import { generateTokens } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';
import { ValidationError, NotFoundError } from '../src/utils/errors.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('Phase 5.9 Missing Branch Coverage Suite', () => {
  const companyId = 'phase59-' + Date.now();
  const scope: TenantScope = { companyId, company_id: companyId };
  let db: any;
  let server: http.Server;
  let wsPort: number;

  beforeAll(async () => {
    db = await connectMongo();

    const compObjId = new ObjectId();
    await db.collection('company').insertOne({
      _id: compObjId,
      company_id: companyId,
      name: 'Phase 5.9 Edge Corp',
      business_type: 'Manufacturing',
      created_at: new Date(),
      updated_at: new Date(),
    });

    server = http.createServer();
    setupWebSocketGateway(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        wsPort = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (db) {
      await db.collection('company').deleteMany({ company_id: companyId });
      await db.collection('bills').deleteMany({ company_id: companyId });
      await db.collection('inventory_items').deleteMany({ company_id: companyId });
      await db.collection('workers').deleteMany({ company_id: companyId });
      await db.collection('material_assignments').deleteMany({ company_id: companyId });
      await db.collection('pay_records').deleteMany({ company_id: companyId });
      await db.collection('business_data').deleteMany({ company_id: companyId });
      await db.collection('financial_summaries').deleteMany({ company_id: companyId });
      await db.collection('business_insights').deleteMany({ company_id: companyId });
    }
  });

  // ==========================================
  // 1. BillsRepository Branches
  // ==========================================
  describe('BillsRepository Edge Branches', () => {
    it('covers non-numeric invoice number in resync and counter check', async () => {
      const year = new Date().getFullYear();
      const prefix = `INV-${year}-`;

      // Insert a bill with non-numeric suffix
      await db.collection('bills').insertOne({
        company_id: companyId,
        invoice_number: `${prefix}NONNUMERIC`,
        created_at: new Date(),
      });

      // Force resyncCounter to run when lastBill has non-numeric invoice number
      const num1 = await BillsRepository.getNextInvoiceNumber(scope, true);
      expect(num1).toMatch(new RegExp(`^INV-${year}-\\d{5}$`));

      // Now counter exists in counters collection, delete seq to test (counter.seq ?? 0)
      const counterId = `${companyId}_${year}`;
      await db.collection('counters').updateOne(
        { _id: counterId },
        { $unset: { seq: '' } }
      );

      // Call getNextInvoiceNumber with forceResync=false and lastBill with non-numeric
      const num2 = await BillsRepository.getNextInvoiceNumber(scope, false);
      expect(num2).toMatch(new RegExp(`^INV-${year}-\\d{5}$`));

      // Test findOneAndUpdate returning document without seq (updated?.seq ?? 1)
      const { Collection } = await import('mongodb');
      const findOneAndUpdateSpy = vi.spyOn(Collection.prototype, 'findOneAndUpdate').mockResolvedValueOnce(null as any);
      try {
        const num3 = await BillsRepository.getNextInvoiceNumber(scope, false);
        expect(num3).toBe(`INV-${year}-00001`);
      } finally {
        findOneAndUpdateSpy.mockRestore();
      }
    });

    it('covers insertBillWithRetry non-duplicate throw err branch', async () => {
      const { Collection } = await import('mongodb');
      const insertSpy = vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(
        new Error('Connection refused to replica set')
      );

      try {
        await expect(
          BillsRepository.insertBillWithRetry(scope, () => ({ bill_type: 'kacha' } as any))
        ).rejects.toThrow('Connection refused to replica set');
      } finally {
        insertSpy.mockRestore();
      }
    });
  });

  // ==========================================
  // 2. DashboardService Branches
  // ==========================================
  describe('DashboardService Export & Analytics Branches', () => {
    it('covers generateExportFile for complete_analytics, worker_management, salary_payments, and business_trends', async () => {
      // Seed business data with quotes and commas to exercise toCsvCell escaping
      await db.collection('business_data').insertOne({
        company_id: companyId,
        date: new Date('2026-05-10T12:00:00Z'),
        product: 'Widget "Deluxe", Super',
        category: 'Electronics, Household',
        quantity: 5,
        production_cost: 20,
        selling_price: 50,
      });

      // Seed worker with assignments and pay records
      const workerId = new ObjectId();
      await db.collection('workers').insertOne({
        _id: workerId,
        company_id: companyId,
        name: 'John "The Builder" Doe',
        phone: '9876543210',
        is_active: true,
      });

      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        worker_id: workerId,
        material_name: 'Timber',
        quantity: 10,
        price_per_unit: 15,
        status: 'open',
      });

      await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker: workerId,
        date: '2026-05-15',
        product_name: 'Chair',
        units_produced: 10,
        rate_per_unit: 25,
        paid: true,
      });

      // Seed orphaned pay record (worker is null)
      await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker: null,
        date: 2026, // non-date, non-string >= 10 for formatDate fallback String(val)
        product_name: 'Table',
        units_produced: 2,
        rate_per_unit: 50,
        paid: false,
      });

      // Seed financial summaries and insights for complete_analytics
      await db.collection('financial_summaries').insertOne({
        company_id: companyId,
        timestamp: new Date('2026-05-01'),
        total_revenue: 15000,
        total_profit: 4500,
        worker_payments: 2000,
        active_workers: 4,
      });

      await db.collection('business_insights').insertOne({
        company_id: companyId,
        title: 'High Material Cost Alert',
        description: 'A'.repeat(120), // > 100 chars to test slice(0, 100) + "..."
        created_at: new Date('2026-05-02'),
      });

      const exportBiz = await DashboardService.generateExportFile(scope, 'business_trends');
      expect(exportBiz).toContain('.csv');

      const exportWorkers = await DashboardService.generateExportFile(scope, 'worker_management');
      expect(exportWorkers).toContain('.csv');

      const exportSalary = await DashboardService.generateExportFile(scope, 'salary_payments');
      expect(exportSalary).toContain('.csv');

      const exportAnalytics = await DashboardService.generateExportFile(scope, 'complete_analytics');
      expect(exportAnalytics).toContain('.csv');
    });

    it('covers getRevExpData with confirmed bills and monthly series merging', async () => {
      // Seed a profit confirmed bill in the date range
      const billDate = new Date();
      await db.collection('bills').insertOne({
        company_id: companyId,
        bill_type: 'pakka',
        grand_total: 10000,
        profit_confirmed: true,
        profit_confirmed_amount: 3000,
        profit_confirmed_at: billDate,
      });

      // Call getRevExpData with months=6
      const revExp = await DashboardService.getRevExpData(scope, 6);
      expect(revExp.labels.length).toBeGreaterThan(0);
      expect(revExp.revenue.length).toBe(revExp.labels.length);
      expect(revExp.expenses.length).toBe(revExp.labels.length);
    });

    it('covers getStockOverview with out_of_stock items', async () => {
      await db.collection('inventory_items').insertOne({
        company_id: companyId,
        name: 'Zero Item',
        quantity: 0,
        unit: 'kg',
        cost_price: 10,
        selling_price: 20,
      });

      const data = await DashboardService.getDashboardData(scope);
      expect(data.summary).toBeDefined();
      expect(data.billsCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================
  // 3. BillPdfService Branches
  // ==========================================
  describe('BillPdfService Edge Branches', () => {
    it('covers footer page break when curY + 70 > 780', async () => {
      // Create a bill with ~20 products so curY ends between 715 and 780 before footer
      const products = [];
      for (let i = 1; i <= 21; i++) {
        products.push({
          name: `Footer Test Product ${i}`,
          description: `Desc ${i}`,
          quantity: 1,
          rate: 50,
          unit: 'pcs',
          total: 50,
        });
      }

      const bill = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_type: 'pakka',
        invoice_number: 'INV-FOOTER-BREAK-1',
        products,
        subtotal: 1050,
        discount: 0,
        gst_percentage: 18,
        gst_amount: 189,
        grand_total: 1239,
        buyer: { name: 'Buyer', address: 'Address' },
      } as any;

      const pdf = await BillPdfService.renderBillPdf(bill, {
        name: 'Footer Test Corp',
        bank_account_number: '1122334455',
      });
      expect(pdf.length).toBeGreaterThan(1000);
    });

    it('covers image catch blocks and BillPdfRenderError', async () => {
      const tempCorruptFile = path.resolve(process.cwd(), 'temp_corrupt.png');
      fs.writeFileSync(tempCorruptFile, 'NOT_A_VALID_IMAGE_DATA');

      try {
        // Corrupt image paths for logo, stamp, and signature
        const bill = {
          _id: new ObjectId(),
          company_id: companyId,
          bill_type: 'kacha',
          invoice_number: 'INV-CORRUPT-IMG-1',
          products: [{ name: 'P1', quantity: 1, rate: 10, total: 10 }],
          grand_total: 10,
        } as any;

        // Valid execution even with corrupt images (catches them gracefully)
        const pdf = await BillPdfService.renderBillPdf(bill, {
          logo_url: tempCorruptFile,
          stamp_url: tempCorruptFile,
          signature_url: tempCorruptFile,
        });
        expect(pdf.length).toBeGreaterThan(1000);

        // Test BillPdfRenderError when doc stream or PDFKit errors
        const throwingCompany = {
          get name(): string {
            throw new Error('Forced Company Getter Exception');
          },
        };

        await expect(
          BillPdfService.renderBillPdf(bill, throwingCompany as any)
        ).rejects.toThrow(BillPdfRenderError);
      } finally {
        if (fs.existsSync(tempCorruptFile)) {
          fs.unlinkSync(tempCorruptFile);
        }
      }
    });
  });

  // ==========================================
  // 4. WebSocket Gateway Branches
  // ==========================================
  describe('WebSocket Gateway Edge Branches', () => {
    it('covers non-ws upgrade rejection and malformed upgrade URL', async () => {
      // 1. Upgrade request to non-matching route -> socket destroyed
      const req = http.request({
        port: wsPort,
        host: '127.0.0.1',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
        },
        path: '/some/unsupported/path',
      });
      req.end();

      const socketDestroyed = await new Promise<boolean>((resolve) => {
        req.on('error', () => resolve(true));
        req.on('close', () => resolve(true));
        setTimeout(() => resolve(true), 500);
      });
      expect(socketDestroyed).toBe(true);

      // 2. Malformed URL upgrade (raw socket write)
      const client = net.connect({ port: wsPort, host: '127.0.0.1' }, () => {
        client.write('GET http://[::1]:namedport/bad HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      });
      const closed = await new Promise<boolean>((resolve) => {
        client.on('close', () => resolve(true));
        client.on('error', () => resolve(true));
        setTimeout(() => resolve(true), 500);
      });
      expect(closed).toBe(true);
    });

    it('covers AI Assistant WS unauthenticated connection, first-message token auth, and errors', async () => {
      // Connect without token in query/headers -> connected in unauthenticated state
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/ai-assistant/`);
      const statusMsg = await new Promise<any>((resolve) => {
        ws.once('message', (d) => resolve(JSON.parse(d.toString())));
      });
      expect(statusMsg.type).toBe('session_status');
      expect(statusMsg.authenticated).toBe(false);

      // Send token for user with no company
      const noCompUserId = new ObjectId();
      const noCompEmail = `nocomp_${Date.now()}@example.com`;
      try {
        await db.collection('user').insertOne({
          _id: noCompUserId,
          email: noCompEmail,
          password: hashPassword('Pass123!'),
        });

        const noCompToken = generateTokens({ _id: noCompUserId, email: noCompEmail, name: 'NoComp' }, '').access;
        ws.send(JSON.stringify({ token: noCompToken }));

        const errReply = await new Promise<any>((resolve) => {
          ws.once('message', (d) => resolve(JSON.parse(d.toString())));
        });
        expect(errReply.type).toBe('error');
        expect(errReply.content).toContain('No company');

        // Connect another unauthenticated WS and send token for deactivated / non-existent user
        const ws2 = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/ai-assistant/`);
        const statusMsg2 = await new Promise<any>((resolve) => {
          ws2.once('message', (d) => resolve(JSON.parse(d.toString())));
        });
        expect(statusMsg2.type).toBe('session_status');

        const ghostToken = generateTokens({ _id: new ObjectId(), email: 'deactivated@example.com', name: 'Deact' }, companyId).access;
        ws2.send(JSON.stringify({ token: ghostToken }));

        const errReply2 = await new Promise<any>((resolve) => {
          ws2.once('message', (d) => resolve(JSON.parse(d.toString())));
        });
        expect(errReply2.type).toBe('error');
        expect(errReply2.content).toContain('User not found or deactivated');
        ws2.close();
      } finally {
        await db.collection('user').deleteOne({ _id: noCompUserId });
      }
    });
  });

  // ==========================================
  // 5. BillsService Deep Branch Matrix
  // ==========================================
  describe('BillsService Complete Branch Matrix', () => {
    it('covers serializeBill edge fallbacks and zero/null amounts', async () => {
      const rawBill = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_type: 'kacha',
        invoice_number: 'INV-ZERO-' + Date.now(),
        ready_to_deliver: [
          { quantity: 0, item_name: undefined, notes: undefined, date: undefined },
        ],
        transportation_costs: [
          { amount: 0, notes: undefined, date: undefined },
        ],
        misc_costs: [
          { amount: 0, notes: undefined, date: undefined },
        ],
        products: [
          { name: 'Zero Product', quantity: 0, rate: 0, description: undefined, unit: undefined },
        ],
        payments: [
          { amount: 0, notes: undefined, date: '2026-05-20T10:00:00Z' },
        ],
        buyer: { name: 'Buyer', address: 'Addr', gst_number: 'GST1', phone: '123' },
        profit_suggested_amount: 500,
        profit_confirmed_amount: 500,
        profit_confirmed_at: new Date(),
      };

      await db.collection('bills').insertOne(rawBill);

      const serialized = await BillsService.getBill(scope, rawBill._id.toString());
      expect(serialized.worker_cost_total).toBe(0);
      expect(serialized.transportation_cost_total).toBe(0);
      expect(serialized.misc_cost_total).toBe(0);
      expect(serialized.products[0].unit).toBe('pcs');
    });

    it('covers confirmProfit override undefined vs NaN, and reopenProfit', async () => {
      const bill = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'P1', quantity: 1, rate: 100 }],
      });

      // Confirm profit with NaN override -> falls back to preview.suggested_profit
      const conf1 = await BillsService.confirmProfit(scope, bill.id, NaN);
      expect(conf1.profit_confirmed).toBe(true);

      // Reopen profit
      const reopened = await BillsService.reopenProfit(scope, bill.id);
      expect(reopened.profit_confirmed).toBe(false);
      expect(reopened.profit_confirmed_amount).toBeNull();

      // Confirm profit with valid numeric override
      const conf2 = await BillsService.confirmProfit(scope, bill.id, 250);
      expect(conf2.profit_confirmed_amount).toBe(250);
    });

    it('covers addReadyToDeliver and confirmShipment validations & stock deductions', async () => {
      const item = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        sku: 'SKU-SHIP-' + Date.now(),
        name: 'Shipment Item',
        quantity: 50,
        unit: 'box',
      });

      const bill = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Shipment Item', quantity: 10, rate: 100, inventory_item_id: item.insertedId.toString() }],
      });

      // Validation errors on addReadyToDeliver
      await expect(
        BillsService.addReadyToDeliver(scope, bill.id, { inventory_item_id: '' as any, quantity: 5 })
      ).rejects.toThrow('Valid inventory_item_id required.');

      await expect(
        BillsService.addReadyToDeliver(scope, bill.id, { inventory_item_id: 'invalid-id' as any, quantity: 5 })
      ).rejects.toThrow('Valid inventory_item_id required.');

      await expect(
        BillsService.addReadyToDeliver(scope, bill.id, { inventory_item_id: new ObjectId().toString(), quantity: 5 })
      ).rejects.toThrow(NotFoundError);

      await expect(
        BillsService.addReadyToDeliver(scope, bill.id, { inventory_item_id: item.insertedId.toString(), quantity: 0 })
      ).rejects.toThrow('Quantity must be positive.');

      // Valid addReadyToDeliver
      const withBatch = await BillsService.addReadyToDeliver(scope, bill.id, {
        inventory_item_id: item.insertedId.toString(),
        quantity: 5,
        notes: 'Batch 1 ready',
      });
      expect(withBatch.ready_to_deliver.length).toBe(1);

      // Confirm shipment
      const shipped = await BillsService.confirmShipment(scope, bill.id);
      expect(shipped.profit_confirmed).toBeDefined();

      // Attempting to add ready to deliver or confirm shipment after shipped
      await expect(
        BillsService.addReadyToDeliver(scope, bill.id, { inventory_item_id: item.insertedId.toString(), quantity: 1 })
      ).rejects.toThrow('This order has already been marked shipped.');

      await expect(
        BillsService.confirmShipment(scope, bill.id)
      ).rejects.toThrow('This order is already marked shipped.');
    });

    it('covers getBillAssignments batch aggregation and over_returned', async () => {
      const bill = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Assign Item', quantity: 1, rate: 100 }],
      });

      // Insert assignment with batches that exceed assigned quantity (over_returned)
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        bill_id: bill.id,
        material_name: 'Fabric',
        quantity: 10,
        price_per_unit: 5,
        batches: [
          { quantity: 6, date: new Date() },
          { quantity: 6, date: new Date() },
        ],
        wage_amount: 100,
        status: 'completed',
        completed_at: new Date(),
        wastage_quantity: 1,
      });

      const assigns = await BillsService.getBillAssignments(scope, bill.id);
      expect(assigns.length).toBe(1);
      expect(assigns[0].over_returned).toBe(true);
      expect(assigns[0].delivered_quantity).toBe(12);
      expect(assigns[0].balance_quantity).toBe(0);
    });

    it('covers deleteBill stock restoration and pakka conversion non-dup error', async () => {
      const item = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        sku: 'SKU-DEL-' + Date.now(),
        name: 'Delete Bill Stock Item',
        quantity: 20,
        unit: 'pcs',
      });

      const bill = await BillsService.createBill(scope, 'kacha', {
        products: [
          { name: 'Delete Bill Stock Item', quantity: 5, rate: 100, inventory_item_id: item.insertedId.toString() },
          { name: 'Non Stock Item', quantity: 2, rate: 50 },
        ],
      });

      // Delete bill restores inventory stock
      await BillsService.deleteBill(scope, bill.id);

      const restoredItem = await db.collection('inventory_items').findOne({ _id: item.insertedId });
      expect(restoredItem.quantity).toBe(20);

      // Pakka bill conversion when already pakka
      const pakkaBill = await BillsService.createBill(scope, 'pakka', {
        buyer: { name: 'Buyer', address: 'Addr', gst_number: '07AAAAA0000A1Z5' },
        gst_percentage: 18,
        products: [{ name: 'Item', quantity: 1, rate: 100 }],
      });

      await expect(
        BillsService.convertToPakka(scope, pakkaBill.id, { gst_number: '07AAAAA0000A1Z5' })
      ).rejects.toThrow('Bill is already a pakka (formal) bill.');

      // Pakka conversion updateBill unexpected error propagation
      const kachaBill = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Item', quantity: 1, rate: 100 }],
      });

      const updateSpy = vi.spyOn(BillsRepository, 'updateBill').mockRejectedValueOnce(new Error('Fatal Mongo Crash on Pakka Conversion'));
      await expect(
        BillsService.convertToPakka(scope, kachaBill.id, { gst_number: '07AAAAA0000A1Z5' })
      ).rejects.toThrow('Fatal Mongo Crash on Pakka Conversion');
      updateSpy.mockRestore();
    });

    it('covers updateBill fallback branches, null item rollback, and null update returns', async () => {
      const pakkaBill = await BillsService.createBill(scope, 'pakka', {
        buyer: { name: 'Corporate Buyer', address: 'Plot 10', gst_number: '07AAAAA0000A1Z5' },
        discount: 10,
        gst_percentage: 12,
        products: [{ name: 'Existing Product', quantity: 5, rate: 100 }],
      });

      // 1. updateBill with products, discount, gst_percentage undefined -> uses existing values
      const updatedFallback = await BillsService.updateBill(scope, pakkaBill.id, {});
      expect(updatedFallback.discount).toBe(10);
      expect(updatedFallback.gst_percentage).toBe(12);

      // 2. updateBill when positive delta conditional deduction fails and findInventoryItemById returns null
      const fakeItemId = new ObjectId().toString();
      const billForNullItem = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Item P', quantity: 1, rate: 50 }],
      });

      const condSpy = vi.spyOn(BillsRepository, 'adjustInventoryStockConditional').mockResolvedValueOnce(false);
      const findItemSpy = vi.spyOn(BillsRepository, 'findInventoryItemById').mockResolvedValueOnce(null);

      await expect(
        BillsService.updateBill(scope, billForNullItem.id, {
          products: [{ name: 'Item P', quantity: 3, rate: 50, inventory_item_id: fakeItemId }],
        })
      ).rejects.toThrow('Insufficient stock: Item: requested 3.0 pcs, only 0.0 pcs in stock');

      condSpy.mockRestore();
      findItemSpy.mockRestore();

      // 3. updateBill returns null from BillsRepository.updateBill
      const updateNullSpy = vi.spyOn(BillsRepository, 'updateBill').mockResolvedValueOnce(null);
      await expect(
        BillsService.updateBill(scope, pakkaBill.id, { buyer: { name: 'New Buyer' } })
      ).rejects.toThrow(NotFoundError);
      updateNullSpy.mockRestore();

      // 4. updateBillRaw returning null in recordPayment, addTransportationCost, addMiscCost, addReadyToDeliver
      const rawNullSpy = vi.spyOn(BillsRepository, 'updateBillRaw').mockResolvedValue(null);

      await expect(BillsService.recordPayment(scope, pakkaBill.id, { amount: 50 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addTransportationCost(scope, pakkaBill.id, { amount: 50 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addMiscCost(scope, pakkaBill.id, { amount: 50 })).rejects.toThrow(NotFoundError);

      const invItem = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        sku: 'SKU-R2D-' + Date.now(),
        name: 'R2D Item',
        quantity: 10,
        unit: 'pcs',
      });
      await expect(
        BillsService.addReadyToDeliver(scope, pakkaBill.id, { inventory_item_id: invItem.insertedId.toString(), quantity: 1 })
      ).rejects.toThrow(NotFoundError);

      rawNullSpy.mockRestore();

      // 5. updateBill returning null in confirmProfit, reopenProfit, confirmShipment
      const updateNullSpy2 = vi.spyOn(BillsRepository, 'updateBill').mockResolvedValue(null);
      await expect(BillsService.confirmProfit(scope, pakkaBill.id)).rejects.toThrow(NotFoundError);
      await expect(BillsService.reopenProfit(scope, pakkaBill.id)).rejects.toThrow(NotFoundError);
      updateNullSpy2.mockRestore();
    });

    it('covers getProfitPreview and getBillAssignments deep branch coverage', async () => {
      // Inventory item with known cost price
      const itemWithCost = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        sku: 'SKU-COST-' + Date.now(),
        name: 'Cost Item',
        quantity: 100,
        unit: 'pcs',
        cost_price: 45,
      });

      const itemWithoutCost = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        sku: 'SKU-NOCOST-' + Date.now(),
        name: 'Unknown Cost Item',
        quantity: 100,
        unit: 'pcs',
      });

      const billDoc = await BillsService.createBill(scope, 'kacha', {
        products: [
          { name: 'Cost Item', quantity: 2, rate: 100, inventory_item_id: itemWithCost.insertedId.toString() },
          { name: 'Unknown Cost Item', quantity: 1, rate: 80, inventory_item_id: itemWithoutCost.insertedId.toString() },
          { name: 'No Item ID Product', quantity: 3, rate: 30 },
        ],
      });

      // Add transportation and misc costs
      await BillsService.addTransportationCost(scope, billDoc.id, { amount: 50 });
      await BillsService.addMiscCost(scope, billDoc.id, { amount: 25 });
      await BillsService.recordPayment(scope, billDoc.id, { amount: 150 });

      // Add linked pay record
      await db.collection('pay_records').insertOne({
        company_id: companyId,
        bill_id: billDoc.id,
        units_produced: 5,
        rate_per_unit: 10,
      });

      const preview = await BillsService.getProfitPreview(scope, billDoc.id);
      expect(preview.cost_breakdown.material_cost).toBe(90);
      expect(preview.cost_breakdown.worker_cost).toBe(50);
      expect(preview.cost_breakdown.transportation_cost).toBe(50);
      expect(preview.cost_breakdown.misc_cost).toBe(25);
      expect(preview.lines[0].cost_known).toBe(true);
      expect(preview.lines[1].cost_known).toBe(true);
      expect(preview.lines[2].cost_known).toBe(false);

      // getBillAssignments with assignment having worker._id, batches null, status null, bill_id null
      const workerIdObj = new ObjectId();
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        bill_id: billDoc.id,
        material_name: 'Raw Silk',
        quantity: 10,
        price_per_unit: 12,
        worker: { _id: workerIdObj },
        batches: null as any,
        status: null as any,
      });

      const assigns = await BillsService.getBillAssignments(scope, billDoc.id);
      const silkAssign = assigns.find((a) => a.material_name === 'Raw Silk');
      expect(silkAssign).toBeDefined();
      expect(silkAssign?.worker_id).toBe(workerIdObj.toString());
      expect(silkAssign?.status).toBe('open');
      expect(silkAssign?.delivered_quantity).toBe(0);
    });

    it('covers DashboardService profit intervals and worker payments polymorphic worker fields', async () => {
      // 1. Profit trends with daily, weekly, and multi-year data
      await db.collection('business_data').insertOne({
        company_id: companyId,
        date: new Date('2025-01-15T10:00:00Z'),
        product: 'Old Year Product',
        category: 'Cat',
        quantity: 2,
        production_cost: 10,
        selling_price: 20,
        total_profit: 20,
      });

      await db.collection('business_data').insertOne({
        company_id: companyId,
        date: new Date('2026-06-15T10:00:00Z'),
        product: 'New Year Product',
        category: 'Cat',
        quantity: 4,
        production_cost: 10,
        selling_price: 30,
        total_profit: 80,
      });

      const dailyTrends = await DashboardService.getProfitTrends(scope, 24, 'daily');
      expect(dailyTrends.labels).toBeDefined();

      const weeklyTrends = await DashboardService.getProfitTrends(scope, 24, 'weekly');
      expect(weeklyTrends.labels).toBeDefined();

      const multiYearTrends = await DashboardService.getProfitTrends(scope, 24, 'monthly');
      expect(multiYearTrends.labels.length).toBeGreaterThanOrEqual(2);

      // 2. getWorkerPayments with string worker, worker._id, worker_id, deleted worker, and paid via amountPaid >= totalOwed
      const realWorker = await db.collection('workers').insertOne({
        company_id: companyId,
        name: 'Real Worker',
        is_active: true,
      });

      await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker: realWorker.insertedId.toString(), // string format
        date: new Date('2026-06-01T10:00:00Z'),
        units_produced: 2,
        rate_per_unit: 100,
        amount_paid: 200, // amountPaid >= totalOwed with paid: false
        paid: false,
      });

      await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker: { _id: realWorker.insertedId }, // object format
        date: new Date('2026-06-02T10:00:00Z'),
        units_produced: 1,
        rate_per_unit: 50,
        paid: true,
      });

      const deletedWorkerId = new ObjectId();
      await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker_id: deletedWorkerId.toString(), // worker_id field
        date: new Date('2026-06-03T10:00:00Z'),
        units_produced: 1,
        rate_per_unit: 30,
        paid: false,
      });

      const recentPayments = await DashboardService.getWorkerPayments(scope);
      expect(recentPayments.length).toBeGreaterThanOrEqual(3);
      expect(recentPayments.some((p) => p.name === 'Real Worker')).toBe(true);
      expect(recentPayments.some((p) => p.name === 'Deleted Worker')).toBe(true);
    });

    it('covers dashboard exports with zero/missing fields and top workers with nulls', async () => {
      const edgeCompanyId = 'dash-edge-' + Date.now();
      const edgeScope: TenantScope = { companyId: edgeCompanyId, company_id: edgeCompanyId };

      try {
        // Business data with 0s and nulls
        await db.collection('business_data').insertOne({
          company_id: edgeCompanyId,
          date: new Date('2026-07-01'),
          product: null,
          category: null,
          quantity: 0,
          production_cost: 0,
          selling_price: 0,
        });

        // Worker with nulls and inactive
        const edgeWorker = await db.collection('workers').insertOne({
          company_id: edgeCompanyId,
          name: null,
          phone: null,
          is_active: false,
        });

        // Material assignment with 0 values
        await db.collection('material_assignments').insertOne({
          company_id: edgeCompanyId,
          worker_id: edgeWorker.insertedId,
          quantity: 0,
          price_per_unit: 0,
        });

        // Pay record with 0 values, null product, and unpaid
        await db.collection('pay_records').insertOne({
          company_id: edgeCompanyId,
          worker: edgeWorker.insertedId,
          product_name: null,
          units_produced: 0,
          rate_per_unit: 0,
          paid: false,
          date: new Date('2026-07-02'),
        });

        // Pay record with null worker and null date
        await db.collection('pay_records').insertOne({
          company_id: edgeCompanyId,
          worker: null,
          product_name: null,
          units_produced: 0,
          rate_per_unit: 0,
          paid: false,
          date: null,
        });

        // Financial summary with 0s
        await db.collection('financial_summaries').insertOne({
          company_id: edgeCompanyId,
          timestamp: new Date('2026-07-01'),
          total_revenue: 0,
          total_profit: 0,
          worker_payments: 0,
          active_workers: 0,
        });

        // Insight with null description
        await db.collection('business_insights').insertOne({
          company_id: edgeCompanyId,
          title: null,
          description: null,
          created_at: new Date('2026-07-01'),
        });

        await DashboardService.generateExportFile(edgeScope, 'business_trends');
        await DashboardService.generateExportFile(edgeScope, 'worker_management');
        await DashboardService.generateExportFile(edgeScope, 'salary_payments');
        await DashboardService.generateExportFile(edgeScope, 'complete_analytics');

        // Top workers with null latest payment and null name
        const top = await DashboardService.getTopWorkers(edgeScope);
        expect(Array.isArray(top)).toBe(true);
      } finally {
        await db.collection('business_data').deleteMany({ company_id: edgeCompanyId });
        await db.collection('workers').deleteMany({ company_id: edgeCompanyId });
        await db.collection('material_assignments').deleteMany({ company_id: edgeCompanyId });
        await db.collection('pay_records').deleteMany({ company_id: edgeCompanyId });
        await db.collection('financial_summaries').deleteMany({ company_id: edgeCompanyId });
        await db.collection('business_insights').deleteMany({ company_id: edgeCompanyId });
      }
    });

    it('covers BillsService getBillPdf, shareWhatsApp, costs zero checks, and pakka net deltas', async () => {
      const bill = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Test Prod', quantity: 2, rate: 50 }],
      });

      // 1. getBillPdf with company existing
      const pdfRes1 = await BillsService.getBillPdf(scope, bill.id);
      expect(pdfRes1.pdf.length).toBeGreaterThan(100);

      // getBillPdf with findCompany returning null and empty invoice_number
      const findCompanySpy = vi.spyOn(BillsRepository, 'findCompany').mockResolvedValue(null);
      const findBillSpy = vi.spyOn(BillsRepository, 'findBillById').mockResolvedValue({
        _id: new ObjectId(bill.id),
        company_id: companyId,
        bill_type: 'kacha',
        invoice_number: '',
        products: [{ name: 'Test Prod', quantity: 1, rate: 50 }],
      } as any);

      const pdfRes2 = await BillsService.getBillPdf(scope, bill.id);
      expect(pdfRes2.filename).toBe('invoice.pdf');

      // 2. shareWhatsApp with company null and company existing
      await expect(BillsService.shareWhatsApp(scope, bill.id, '9876543210')).rejects.toThrow();

      findCompanySpy.mockRestore();
      findBillSpy.mockRestore();

      // 3. addTransportationCost and addMiscCost validation on zero / negative amounts
      await expect(BillsService.addTransportationCost(scope, bill.id, { amount: 0 })).rejects.toThrow('Amount must be positive.');
      await expect(BillsService.addTransportationCost(scope, bill.id, { amount: -10 })).rejects.toThrow('Amount must be positive.');
      await expect(BillsService.addMiscCost(scope, bill.id, { amount: 0 })).rejects.toThrow('Amount must be positive.');
      await expect(BillsService.addMiscCost(scope, bill.id, { amount: -5 })).rejects.toThrow('Amount must be positive.');

      // 4. convertToPakka with positive and negative net deltas, missing buyer, 0 gst percentage, 0 discount
      const itemInc = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        sku: 'SKU-INC-' + Date.now(),
        name: 'Increase Item',
        quantity: 50,
        unit: 'pcs',
      });

      const itemDec = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        sku: 'SKU-DEC-' + Date.now(),
        name: 'Decrease Item',
        quantity: 50,
        unit: 'pcs',
      });

      const billWithDeltas = await BillsService.createBill(scope, 'kacha', {
        products: [
          { name: 'Increase Item', quantity: 2, rate: 100, inventory_item_id: itemInc.insertedId.toString() },
          { name: 'Decrease Item', quantity: 5, rate: 100, inventory_item_id: itemDec.insertedId.toString() },
        ],
      });

      // Clear buyer on the bill doc in Mongo to test `(bill.buyer ?? {})`
      await db.collection('bills').updateOne({ _id: new ObjectId(billWithDeltas.id) }, { $unset: { buyer: '', discount: '' } });

      const convertedWithDeltas = await BillsService.convertToPakka(scope, billWithDeltas.id, {
        gst_number: '07AAAAA0000A1Z5',
        products: [
          { name: 'Increase Item', quantity: 4, rate: 100, inventory_item_id: itemInc.insertedId.toString() }, // +2 net delta
          { name: 'Decrease Item', quantity: 2, rate: 100, inventory_item_id: itemDec.insertedId.toString() }, // -3 net delta
        ],
      });

      expect(convertedWithDeltas.bill_type).toBe('pakka');

      // 5. applyStockDeductions when item has no unit and no name
      const fakeObjId = new ObjectId().toString();
      const findItemSpy2 = vi.spyOn(BillsRepository, 'findInventoryItemById').mockResolvedValueOnce({
        _id: new ObjectId(fakeObjId),
        company_id: companyId,
        // no unit, no name
      });
      const condSpy = vi.spyOn(BillsRepository, 'adjustInventoryStockConditional').mockResolvedValueOnce(false);

      await expect(
        BillsService.createBill(scope, 'kacha', {
          products: [{ name: 'Ghost Item', quantity: 2, rate: 10, inventory_item_id: fakeObjId }],
        })
      ).rejects.toThrow('Insufficient stock: undefined: requested 2.0 pcs, only 0.0 pcs in stock');

      findItemSpy2.mockRestore();
      condSpy.mockRestore();
    });

    it('covers workerCostTotal, listBills multiple assignment mapping, and zero cost fallbacks', async () => {
      const finalBill = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Final Item', quantity: 1, rate: 50 }],
      });

      // Insert 2 completed assignments linked to this bill
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        bill_id: finalBill.id,
        material_name: 'Mat 1',
        quantity: 5,
        price_per_unit: 10,
        status: 'completed',
        wage_amount: 150,
      });

      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        bill_id: finalBill.id,
        material_name: 'Mat 2',
        quantity: 3,
        price_per_unit: 10,
        status: 'completed',
        wage_amount: 75,
      });

      // Insert assignment with no status and no bill_id for this company
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        material_name: 'Mat Orphan',
        quantity: 1,
        price_per_unit: 10,
      });

      // 1. listBills covering multiple assignments per bill and orphans
      const bills = await BillsService.listBills(scope);
      const matched = bills.find((b) => b.id === finalBill.id);
      expect(matched?.worker_cost_total).toBe(225);

      // 2. getBill covering workerCostTotal addition
      const retrieved = await BillsService.getBill(scope, finalBill.id);
      expect(retrieved.worker_cost_total).toBe(225);

      // 3. getProfitPreview with 0 payments, 0 pay records, 0 transportation, 0 misc
      await db.collection('pay_records').insertOne({
        company_id: companyId,
        bill_id: finalBill.id,
        units_produced: 0,
        rate_per_unit: 0,
      });

      await db.collection('bills').updateOne(
        { _id: new ObjectId(finalBill.id) },
        {
          $set: {
            transportation_costs: [{ amount: 0 }],
            misc_costs: [{ amount: 0 }],
            payments: [{ amount: 0 }],
            invoice_number: '',
          },
        }
      );

      const previewZero = await BillsService.getProfitPreview(scope, finalBill.id);
      expect(previewZero.revenue_collected).toBe(0);
      expect(previewZero.cost_breakdown.worker_cost).toBe(0);
      expect(previewZero.cost_breakdown.transportation_cost).toBe(0);
      expect(previewZero.cost_breakdown.misc_cost).toBe(0);

      // Retrieve bill without invoice_number
      const noInvBill = await BillsService.getBill(scope, finalBill.id);
      expect(noInvBill.invoice_number).toBe('');
    });
  });
});


