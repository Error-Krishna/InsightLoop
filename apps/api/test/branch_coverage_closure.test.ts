import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ObjectId, type Document } from 'mongodb';
import { WebSocket } from 'ws';
import { connectMongo, getCollection } from '../src/db/mongo.js';
import * as mongoModule from '../src/db/mongo.js';
import { HealthRepository } from '../src/modules/health/health.repository.js';
import * as redisModule from '../src/db/redis.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillPdfService } from '../src/modules/bills/pdf.service.js';
import {
  WhatsAppService,
  normalizePhoneNumber,
  WhatsAppNotConfigured,
  OpenWANotConfigured,
  WhatsAppSendError,
  OpenWASendError,
} from '../src/modules/bills/whatsapp.service.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { DashboardRepository } from '../src/modules/dashboard/dashboard.repository.js';
import { setupWebSocketGateway, closeWebSockets, wsEvents } from '../src/ws/gateway.js';
import { generateTokens } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';
import { ValidationError, NotFoundError, BadRequestError } from '../src/utils/errors.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('Branch Coverage Final Closure Suite', () => {
  const companyId = 'closure-' + Date.now();
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
      name: 'Closure Test Corp',
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
    }
  });

  // ==========================================
  // 1. HealthRepository
  // ==========================================
  describe('HealthRepository Branches', () => {
    it('covers redis failure catch block', async () => {
      const pingFailSpy = vi.spyOn(redisModule, 'getRedisClient').mockReturnValueOnce({
        ping: async () => {
          throw new Error('Connection refused');
        },
      } as any);

      const health = await HealthRepository.checkRedis();
      expect(health.configured).toBe(true);
      expect(health.status).toBe('down');
      expect(health.latency_ms).toBe(-1);
      pingFailSpy.mockRestore();
    });

    it('covers getClient returning null in checkMongo', async () => {
      const clientSpy = vi.spyOn(mongoModule, 'getClient').mockReturnValueOnce(null as any);
      const res = await HealthRepository.checkMongo();
      expect(res.pool.maxPoolSize).toBe(100);
      expect(res.pool.minPoolSize).toBe(0);
      clientSpy.mockRestore();
    });
  });

  // ==========================================
  // 2. BillsRepository
  // ==========================================
  describe('BillsRepository Branches', () => {
    it('covers insertBillWithRetry error handling branches', async () => {
      // 1. Non-dup key error thrown by docFactory propagates immediately
      await expect(
        BillsRepository.insertBillWithRetry(scope, () => {
          throw new Error('Unrecoverable factory failure');
        })
      ).rejects.toThrow('Unrecoverable factory failure');

      // 2. Loop exhaustion when maxAttempts is 0
      await expect(
        BillsRepository.insertBillWithRetry(scope, () => ({ bill_type: 'kacha' } as any), 0)
      ).rejects.toThrow('Could not generate a unique invoice number, please retry.');

      // 3. Duplicate key error exhaustion on retries
      const existingBill = await db.collection('bills').insertOne({
        company_id: companyId,
        invoice_number: 'INV-DUP-TEST-' + Date.now(),
      });
      await expect(
        BillsRepository.insertBillWithRetry(
          scope,
          () => ({ _id: existingBill.insertedId, bill_type: 'kacha' } as any),
          2
        )
      ).rejects.toThrow('Could not generate a unique invoice number, please retry.');

      // 4. Duplicate key text error regex branch without code 11000
      const billsCol = getCollection('bills');
      const origInsert = billsCol.insertOne;
      let insertAttempts = 0;
      billsCol.insertOne = (async (doc: any, opts: any) => {
        insertAttempts++;
        if (insertAttempts === 1) {
          throw new Error('E11000 duplicate key error in index');
        }
        return origInsert.call(billsCol, doc, opts);
      }) as any;

      try {
        const regexBill = await BillsRepository.insertBillWithRetry(scope, () => ({
          bill_type: 'kacha',
          grand_total: 100,
        } as any));
        expect(regexBill._id).toBeDefined();
      } finally {
        billsCol.insertOne = origInsert;
      }
    });
  });

  // ==========================================
  // 3. WhatsAppService
  // ==========================================
  describe('WhatsAppService Branches', () => {
    it('covers normalizePhoneNumber branches', () => {
      expect(normalizePhoneNumber(null)).toBe('');
      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber('919876543210')).toBe('919876543210'); // 12 digits
      expect(normalizePhoneNumber('09876543210')).toBe('919876543210'); // 11 digits with 0
      expect(normalizePhoneNumber('9876543210')).toBe('919876543210'); // 10 digits
      expect(normalizePhoneNumber('+1-415-555-2671')).toBe('14155552671'); // international
    });

    it('covers missing phone number validation', async () => {
      const dummyBill = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_type: 'kacha',
        buyer: { name: 'No Phone Buyer', phone: '' },
      } as any;

      await expect(WhatsAppService.shareBillPdf(dummyBill, {}, '')).rejects.toThrow(
        "No phone number on file for this bill's customer. Add one and try again."
      );
    });

    it('covers OpenWA provider branches', async () => {
      const origProvider = process.env.WHATSAPP_PROVIDER;
      const origKey = process.env.OPENWA_API_KEY;
      const origUrl = process.env.OPENWA_BASE_URL;

      process.env.WHATSAPP_PROVIDER = 'openwa';
      delete process.env.OPENWA_API_KEY;

      const dummyBill = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_type: 'kacha',
        invoice_number: 'INV-TEST-001',
        buyer: { name: 'Customer', phone: '9876543210' },
      } as any;

      // 1. Not configured
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow(OpenWANotConfigured);

      // 2. OpenWA session query failure
      process.env.OPENWA_API_KEY = 'test-key';
      process.env.OPENWA_BASE_URL = 'http://localhost:9999';

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      } as any);
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow('OpenWA session query failed');

      // 3. No active session found
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as any);
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow('No active OpenWA session found.');

      // 4. Send document failure
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'sess-1', status: 'ready' }],
      } as any);
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        statusText: 'Payload Too Large',
      } as any);
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow('OpenWA send failed: Payload Too Large');

      // 5. Network fetch throw
      fetchSpy.mockRejectedValueOnce(new Error('Network ECONNREFUSED'));
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow('Failed to send via OpenWA');

      // 6. Successful OpenWA send
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'sess-1', status: 'ready' }],
      } as any);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, messageId: 'msg-123' }),
      } as any);
      const res = await WhatsAppService.shareBillPdf(dummyBill, {});
      expect(res.detail).toBe('Bill sent via WhatsApp.');

      fetchSpy.mockRestore();
      process.env.WHATSAPP_PROVIDER = origProvider;
      process.env.OPENWA_API_KEY = origKey;
      process.env.OPENWA_BASE_URL = origUrl;
    });

    it('covers Meta provider branches', async () => {
      const origProvider = process.env.WHATSAPP_PROVIDER;
      const origEnabled = process.env.WHATSAPP_ENABLED;
      const origPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const origToken = process.env.WHATSAPP_ACCESS_TOKEN;

      process.env.WHATSAPP_PROVIDER = 'meta';
      process.env.WHATSAPP_ENABLED = 'false';

      const dummyBill = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_type: 'pakka',
        invoice_number: 'INV-TEST-002',
        buyer: { name: 'Customer', phone: '9876543210' },
      } as any;

      // 1. Not configured
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow(WhatsAppNotConfigured);

      process.env.WHATSAPP_ENABLED = 'true';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-123';
      process.env.WHATSAPP_ACCESS_TOKEN = 'token-123';

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // 2. Media upload error
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      } as any);
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow('Failed to upload media to WhatsApp');

      // 3. Message send error
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'media-456' }),
      } as any);
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        statusText: 'Rate Limited',
      } as any);
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow('Failed to send WhatsApp message');

      // 4. Network fetch throw
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));
      await expect(WhatsAppService.shareBillPdf(dummyBill, {})).rejects.toThrow('WhatsApp error: Network error');

      // 5. Successful Meta send
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'media-456' }),
      } as any);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.123' }] }),
      } as any);
      const res = await WhatsAppService.shareBillPdf(dummyBill, {});
      expect(res.detail).toBe('Bill sent via WhatsApp.');

      fetchSpy.mockRestore();
      process.env.WHATSAPP_PROVIDER = origProvider;
      process.env.WHATSAPP_ENABLED = origEnabled;
      process.env.WHATSAPP_PHONE_NUMBER_ID = origPhoneId;
      process.env.WHATSAPP_ACCESS_TOKEN = origToken;
    });
  });

  // ==========================================
  // 4. BillPdfService
  // ==========================================
  describe('BillPdfService Branches', () => {
    it('covers logo handling, contact combinations, bank details, and notes in renderBillPdf', async () => {
      // 1. Logo URL pointing to nonexistent file (handled gracefully)
      const bill = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_type: 'pakka',
        invoice_number: 'INV-PDF-001',
        created_at: 'not-a-valid-date',
        buyer: { name: 'Buyer with details', address: '456 Commercial Rd', gst_number: 'GST999' },
        products: [
          { name: 'Prod 1', quantity: 2, rate: 100, unit: 'pcs', description: 'Description 1', amount: 200 },
          { name: 'Prod 2', quantity: 3, rate: 50, unit: 'box', description: '', amount: 150 },
        ],
        subtotal: 350,
        discount: 20,
        gst_percentage: 18,
        gst_amount: 59.4,
        grand_total: 389.4,
        payments: [{ amount: 100, date: new Date(), notes: 'Part pay' }],
      } as any;

      const companyWithLogoAndBank = {
        name: 'Full Context Corp',
        address: '100 Industrial Pkwy',
        gst_number: '07AAAAA0000A1Z5',
        phone: '9876543210',
        email: 'info@fullcontext.com',
        logo_url: '/tmp/nonexistent_logo_12345.png',
        bank_name: 'HDFC Bank',
        branch_name: 'Central Branch',
        bank_account_number: '123456789012',
        ifsc_code: 'HDFC0001234',
        stamp_url: '/tmp/nonexistent_stamp.png',
        signature_url: '/tmp/nonexistent_sig.png',
      };

      const pdfBuffer = await BillPdfService.renderBillPdf(bill, companyWithLogoAndBank);
      expect(pdfBuffer.length).toBeGreaterThan(1000);

      // 2. Company with phone only (no email)
      const pdfPhoneOnly = await BillPdfService.renderBillPdf(bill, {
        name: 'Phone Only Corp',
        phone: '9876543210',
      });
      expect(pdfPhoneOnly.length).toBeGreaterThan(1000);

      // 3. Company with email only (no phone)
      const pdfEmailOnly = await BillPdfService.renderBillPdf(bill, {
        name: 'Email Only Corp',
        email: 'hello@example.com',
      });
      expect(pdfEmailOnly.length).toBeGreaterThan(1000);

      // 4. Bill with no buyer, no invoice number, no payments
      const minimalBill = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_type: 'kacha',
        grand_total: 100,
      } as any;
      const pdfMinimal = await BillPdfService.renderBillPdf(minimalBill, {});
      expect(pdfMinimal.length).toBeGreaterThan(1000);
    });
  });

  // ==========================================
  // 5. DashboardService
  // ==========================================
  describe('DashboardService Branches', () => {
    it('covers getTopWorkers and export edge branches', async () => {
      // 1. Worker with null latest_payment
      const workerRes = await db.collection('workers').insertOne({
        company_id: companyId,
        name: 'Unpaid Worker',
        phone: '1122334455',
        is_active: true,
      });

      const topWorkers = await DashboardService.getTopWorkers(scope);
      expect(topWorkers).toBeDefined();

      // 2. Export format with formatDate string slicing and unknown export
      await db.collection('business_data').insertOne({
        company_id: companyId,
        date: '2026-05-15', // string date with length >= 10
        product: 'Date String Item',
        quantity: 2,
        production_cost: 10,
        selling_price: 20,
      });
      const exportTrends = await DashboardService.generateExportFile(scope, 'business_trends');
      expect(exportTrends).toContain('business_trends');

      // Unknown report type
      const exportUnknown = await DashboardService.generateExportFile(scope, 'custom_unknown_report');
      expect(exportUnknown).toContain('custom_unknown_report');
    });
  });

  // ==========================================
  // 6. WebSocket Gateway
  // ==========================================
  describe('WebSocket Gateway Branches', () => {
    it('covers dashboard and ai-assistant user without company and invalid token in first-message auth', async () => {
      // 1. User without company connecting to dashboard
      const emailNoComp = `nocomp_${Date.now()}@example.com`;
      const noCompUserId = new ObjectId();
      await db.collection('user').insertOne({
        _id: noCompUserId,
        email: emailNoComp,
        name: 'No Comp User',
        password: hashPassword('Pass123!'),
      });

      const tokenNoComp = generateTokens({ _id: noCompUserId, email: emailNoComp, name: 'No Comp' }, '').access;

      const wsDash = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/dashboard/any-id/?token=${tokenNoComp}`);
      const dashCloseCode = await new Promise<number>((resolve) => {
        wsDash.on('close', (code) => resolve(code));
      });
      expect(dashCloseCode).toBe(4001);

      // 2. User without company in AI assistant first-message auth
      const wsAi = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/ai-assistant/`);
      await new Promise<void>((resolve) => wsAi.once('message', () => resolve()));

      const noCompPromise = new Promise<any>((resolve) => {
        wsAi.once('message', (d) => resolve(JSON.parse(d.toString())));
      });
      wsAi.send(JSON.stringify({ token: tokenNoComp }));
      const noCompRes = await noCompPromise;
      expect(noCompRes.type).toBe('error');
      expect(noCompRes.content).toContain('No company');

      // 3. Invalid token in first-message auth
      const wsAiInvalid = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/ai-assistant/`);
      await new Promise<void>((resolve) => wsAiInvalid.once('message', () => resolve()));

      const invalidPromise = new Promise<any>((resolve) => {
        wsAiInvalid.once('message', (d) => resolve(JSON.parse(d.toString())));
      });
      wsAiInvalid.send(JSON.stringify({ token: 'completely.invalid.token' }));
      const invalidRes = await invalidPromise;
      expect(invalidRes.type).toBe('error');
      expect(invalidRes.content).toContain('Invalid or expired token.');

      // 4. Trigger dashboard.update live broadcast without data payload
      wsEvents.emit('dashboard.update', { companyId, data: undefined });

      // Clean up test user
      await db.collection('user').deleteOne({ _id: noCompUserId });
    });
  });

  // ==========================================
  // 7. BillsService Stock Deduction & Update Rollbacks
  // ==========================================
  describe('BillsService Stock Deduction & Update Rollbacks', () => {
    it('covers concurrent stock deduction failure rollback and updateBill failure rollback', async () => {
      // 1. Seed two inventory items
      const item1 = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        name: 'Item A',
        sku: `SKU-ROLL-1`,
        type: 'finished',
        quantity: 10,
        unit: 'pcs',
      });
      const item2 = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        name: 'Item B',
        sku: `SKU-ROLL-2`,
        type: 'finished',
        quantity: 10,
        unit: 'pcs',
      });

      // Mock adjustInventoryStockConditional to succeed for first item, then return false for second
      let callCount = 0;
      const condSpy = vi.spyOn(BillsRepository, 'adjustInventoryStockConditional').mockImplementation(async () => {
        callCount++;
        return callCount === 1; // 1st succeeds, 2nd fails
      });

      await expect(
        BillsService.createBill(scope, 'kacha', {
          workflow: 'legacy' as any,
          products: [
            { name: 'Item A', quantity: 2, rate: 100, inventory_item_id: item1.insertedId.toString() },
            { name: 'Item B', quantity: 2, rate: 100, inventory_item_id: item2.insertedId.toString() },
          ],
        })
      ).rejects.toThrow('Insufficient stock: Item B');

      condSpy.mockRestore();

      // 2. updateBill rollback when BillsRepository.updateBill throws
      const bill = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        products: [
          { name: 'Item A', quantity: 1, rate: 100, inventory_item_id: item1.insertedId.toString() },
        ],
      });

      const updateSpy = vi.spyOn(BillsRepository, 'updateBill').mockRejectedValueOnce(new Error('Mongo connection drop during update'));
      await expect(
        BillsService.updateBill(scope, bill.id, {
          products: [
            { name: 'Item A', quantity: 3, rate: 100, inventory_item_id: item1.insertedId.toString() },
          ],
        })
      ).rejects.toThrow('Mongo connection drop during update');
      updateSpy.mockRestore();

      // 3. listBills with billType filtering
      const listAll = await BillsService.listBills(scope);
      expect(listAll.length).toBeGreaterThanOrEqual(1);

      const listKacha = await BillsService.listBills(scope, 'kacha');
      expect(listKacha.length).toBeGreaterThanOrEqual(1);

      const listPakka = await BillsService.listBills(scope, 'pakka');
      expect(Array.isArray(listPakka)).toBe(true);
    });

    it('covers convertToPakka error paths, recordPayment, profit preview, costs, and pdf/whatsapp wrappers', async () => {
      const dummyId = new ObjectId().toString();

      // 1. NotFound / Validation error paths on getBill, recordPayment, addTransportationCost, addMiscCost, confirmShipment
      await expect(BillsService.getBill(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.getBill(scope, dummyId)).rejects.toThrow(NotFoundError);

      await expect(BillsService.recordPayment(scope, 'invalid-id', { amount: 100 })).rejects.toThrow(ValidationError);
      await expect(BillsService.recordPayment(scope, dummyId, { amount: 100 })).rejects.toThrow(NotFoundError);

      await expect(BillsService.getProfitPreview(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.getProfitPreview(scope, dummyId)).rejects.toThrow(NotFoundError);

      await expect(BillsService.addTransportationCost(scope, 'invalid-id', { amount: 10 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addTransportationCost(scope, dummyId, { amount: 10 })).rejects.toThrow(NotFoundError);

      await expect(BillsService.addMiscCost(scope, 'invalid-id', { amount: 10 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addMiscCost(scope, dummyId, { amount: 10 })).rejects.toThrow(NotFoundError);

      await expect(BillsService.createShipment(scope, 'invalid-id', { items: [] })).rejects.toThrow(ValidationError);
      await expect(BillsService.createShipment(scope, dummyId, { items: [] })).rejects.toThrow(NotFoundError);

      await expect(BillsService.getBillPdf(scope, dummyId)).rejects.toThrow(NotFoundError);
      await expect(BillsService.shareWhatsApp(scope, dummyId)).rejects.toThrow(NotFoundError);

      // 2. convertToPakka error paths
      await expect(BillsService.convertToPakka(scope, 'invalid-id', { gst_number: 'GST123' })).rejects.toThrow(ValidationError);
      await expect(BillsService.convertToPakka(scope, dummyId, { gst_number: 'GST123' })).rejects.toThrow(NotFoundError);

      // Convert bill with insufficient stock during conversion
      const itemLow = await db.collection('inventory_items').insertOne({
        company_id: companyId,
        name: 'Low Stock Item',
        quantity: 1,
        unit: 'pcs',
      });
      const billToConvert = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        products: [{ name: 'Low Stock Item', quantity: 1, rate: 100, inventory_item_id: itemLow.insertedId.toString() }],
      });

      await expect(BillsService.recordPayment(scope, billToConvert.id, { amount: -5 })).rejects.toThrow('Payment amount must be positive.');

      // Try converting with products demanding 10 more stock
      await expect(
        BillsService.convertToPakka(scope, billToConvert.id, {
          gst_number: '07AAAAA0000A1Z5',
          products: [{ name: 'Low Stock Item', quantity: 11, rate: 100, inventory_item_id: itemLow.insertedId.toString() }],
        })
      ).rejects.toThrow(ValidationError);

      // 3. updateBill positive delta conditional deduction failure rollback
      const condSpy = vi.spyOn(BillsRepository, 'adjustInventoryStockConditional').mockResolvedValueOnce(false);
      await expect(
        BillsService.updateBill(scope, billToConvert.id, {
          products: [{ name: 'Low Stock Item', quantity: 2, rate: 100, inventory_item_id: itemLow.insertedId.toString() }],
        })
      ).rejects.toThrow('Insufficient stock');
      condSpy.mockRestore();
    });
  });

  describe('Additional PDF & WS Edge Branches', () => {
    it('covers multi-page overflow in BillPdfService', async () => {
      const products = [];
      for (let i = 1; i <= 30; i++) {
        products.push({
          name: `Multi Page Item ${i}`,
          description: `Description line for item ${i}`,
          quantity: 2,
          rate: 100,
          unit: 'pcs',
          total: 200,
        });
      }

      const multiPageBill = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_type: 'pakka',
        invoice_number: 'INV-MULTI-PAGE-001',
        products,
        subtotal: 6000,
        discount: 100,
        gst_percentage: 18,
        gst_amount: 1062,
        grand_total: 6962,
        buyer: { name: 'Corporate Buyer Ltd', address: 'Plot 42, Tech Park', gst_number: '07ABCDE1234F1Z5' },
      } as any;

      const pdf = await BillPdfService.renderBillPdf(multiPageBill, {
        name: 'Enterprise Logistics',
        bank_account_number: '9876543210',
        bank_name: 'State Bank of India',
        ifsc_code: 'SBIN0001234',
      });
      expect(pdf.length).toBeGreaterThan(5000);
    });

    it('covers /ws/dashboard/ user not found, and string company in ws', async () => {
      // Valid token for user not in db
      const ghostToken = generateTokens({ _id: new ObjectId(), email: 'ghost_ws@example.com', name: 'Ghost' }, companyId).access;
      const wsGhost = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/dashboard/${companyId}/?token=${ghostToken}`);
      const ghostCode = await new Promise<number>((resolve) => wsGhost.on('close', (c) => resolve(c)));
      expect(ghostCode).toBe(4001);

      // User with string company (instead of ObjectId) in /ws/dashboard/
      const strCompId = 'str-comp-' + Date.now();
      await db.collection('company').insertOne({
        company_id: strCompId,
        name: 'Str Comp Corp',
      });
      const strUser = new ObjectId();
      const strEmail = `str_ws_${Date.now()}@example.com`;
      await db.collection('user').insertOne({
        _id: strUser,
        email: strEmail,
        name: 'Str User',
        password: hashPassword('Pass123!'),
        company: strCompId,
      });

      const strToken = generateTokens({ _id: strUser, email: strEmail, name: 'Str' }, strCompId).access;
      const wsStr = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/dashboard/${strCompId}/?token=${strToken}`);
      const snap = await new Promise<any>((resolve) => wsStr.once('message', (d) => resolve(JSON.parse(d.toString()))));
      expect(snap.summary).toBeDefined();
      wsStr.close();

      // Clean up
      await db.collection('user').deleteOne({ _id: strUser });
      await db.collection('company').deleteOne({ company_id: strCompId });
    });
  });
});
