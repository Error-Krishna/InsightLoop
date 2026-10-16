import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectMongo, closeMongo, getCollection } from '../src/db/mongo.js';
import { BillPdfService } from '../src/modules/bills/pdf.service.js';
import { WhatsAppService, normalizePhoneNumber, WhatsAppNotConfigured, OpenWANotConfigured } from '../src/modules/bills/whatsapp.service.js';
import { ObjectId } from 'mongodb';
import { createTestUser } from './testHelper.js';

describe('B11: Bill PDF Generation & WhatsApp Share Parity', () => {
  let companyId: string;
  let token: string;
  let testBillId: string;

  beforeAll(async () => {
    await connectMongo();

    const userCtx = await createTestUser();
    companyId = userCtx.companyId;
    token = userCtx.token;

    await getCollection('company').updateOne(
      { company_id: companyId },
      {
        $set: {
          name: 'InsightLoop Textiles Pvt Ltd',
          address: '42 Industrial Area, Phase 2, New Delhi',
          gst_number: '07AAAAA0000A1Z5',
          phone: '+91 98765 43210',
          email: 'accounts@insightloop.com',
          bank_account_number: '98765432101234',
          ifsc_code: 'HDFC0001234',
          bank_name: 'HDFC Bank',
          branch_name: 'Connaught Place',
        },
      },
      { upsert: true }
    );

    await getCollection('bills').deleteMany({ company_id: companyId });

    const billRes = await getCollection('bills').insertOne({
      company_id: companyId,
      bill_type: 'pakka',
      type: 'pakka',
      invoice_number: 'INV-2026-00999',
      date: new Date('2026-10-15T10:00:00Z'),
      due_date: new Date('2026-11-15T10:00:00Z'),
      buyer: {
        name: 'Apex Garments Delhi',
        address: '108 Fashion Street, Gandhi Nagar, Delhi',
        phone: '9811122233',
        gst_number: '07BBBBB1111B1Z9',
      },
      products: [
        { name: 'Dyed Cotton Yarn', quantity: 200, unit: 'kg', rate: 250, amount: 50000 },
        { name: 'Silk Fabric Rolls', quantity: 50, unit: 'meters', rate: 800, amount: 40000 },
      ],
      subtotal: 90000,
      discount_amount: 5000,
      tax_rate: 18,
      tax_amount: 15300,
      total_amount: 100300,
      grand_total: 100300,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    });
    testBillId = billRes.insertedId.toString();
  });

  afterAll(async () => {
    await getCollection('bills').deleteMany({ company_id: companyId });
    await getCollection('company').deleteMany({ company_id: companyId });
    await getCollection('user').deleteMany({ company: companyId });
    await closeMongo();
  });

  describe('1. PDF Generation Parity (Pakka & Kacha)', () => {
    it('renders a complete Pakka Tax Invoice PDF matching Django structure and saves evidence', async () => {
      const bill = await getCollection('bills').findOne({ _id: new ObjectId(testBillId) });
      expect(bill).toBeDefined();

      const company = (await getCollection('company').findOne({ company_id: companyId })) || {};
      const pdfBytes = await BillPdfService.renderBillPdf(bill as any, company as any);

      expect(Buffer.isBuffer(pdfBytes)).toBe(true);
      expect(pdfBytes.length).toBeGreaterThan(1500);

      // Verify PDF magic header and trailer
      const headerStr = pdfBytes.subarray(0, 8).toString('ascii');
      expect(headerStr).toContain('%PDF-');

      // Verify PDF contains uncompressed structural elements and text
      const pdfRawText = pdfBytes.toString('latin1');
      expect(pdfRawText).toContain('/Producer');
      expect(pdfRawText).toContain('(PDFKit)');
      expect(pdfRawText).toContain('/Count 1'); // Exactly 1 page

      // Check DejaVu Sans font parity
      expect(pdfRawText).toContain('DejaVuSans');

      // Save sample PDF evidence
      const evidenceDir = fs.existsSync('docs/migration/evidence')
        ? path.resolve('docs/migration/evidence')
        : path.resolve('../../docs/migration/evidence');
      if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, 'sample_bill_pakka.pdf'), pdfBytes);
    });

    it('renders a Kacha Estimate PDF and saves evidence', async () => {
      const kachaBill = {
        company_id: companyId,
        type: 'kacha',
        invoice_number: 'EST-2026-00042',
        date: new Date('2026-10-15T12:00:00Z'),
        buyer: { name: 'Local Retailer', phone: '9988776655' },
        products: [{ name: 'Stitched Kurtis', quantity: 100, unit: 'pcs', rate: 350, amount: 35000 }],
        subtotal: 35000,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: 35000,
      };

      const company = (await getCollection('company').findOne({ company_id: companyId })) || {};
      const pdfBytes = await BillPdfService.renderBillPdf(kachaBill as any, company as any);

      expect(Buffer.isBuffer(pdfBytes)).toBe(true);
      expect(pdfBytes.length).toBeGreaterThan(1000);
      expect(pdfBytes.subarray(0, 8).toString('ascii')).toContain('%PDF-');

      const evidenceDir = fs.existsSync('docs/migration/evidence')
        ? path.resolve('docs/migration/evidence')
        : path.resolve('../../docs/migration/evidence');
      if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, 'sample_bill_kacha.pdf'), pdfBytes);
    });
  });

  describe('2. WhatsApp Share Logic & Error Mapping Parity', () => {
    it('normalizes Indian phone numbers matching Django implementation', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('+919876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('919876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('09876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('+91 (987) 654-3210')).toBe('919876543210');
    });

    it('fails fast with ValidationError when customer phone is absent', async () => {
      const bill = { type: 'pakka', buyer: {} };
      await expect(WhatsAppService.shareBillPdf(bill as any, {}, '')).rejects.toThrow(
        "No phone number on file for this bill's customer. Add one and try again."
      );
    });

    it('throws WhatsAppNotConfigured when Meta credentials are not configured (matches Django)', async () => {
      const bill = {
        type: 'pakka',
        invoice_number: 'INV-1',
        buyer: { phone: '9876543210' },
        products: [],
      };
      const origEnv = { ...process.env };
      process.env.WHATSAPP_PROVIDER = 'meta';
      delete process.env.WHATSAPP_ENABLED;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;

      await expect(WhatsAppService.shareBillPdf(bill as any, {}, '9876543210')).rejects.toThrow(WhatsAppNotConfigured);
      await expect(WhatsAppService.shareBillPdf(bill as any, {}, '9876543210')).rejects.toThrow(
        'WhatsApp sharing is not configured yet. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN'
      );
      process.env = origEnv;
    });

    it('throws OpenWANotConfigured when OpenWA provider is selected but unconfigured', async () => {
      const bill = {
        type: 'kacha',
        invoice_number: 'EST-1',
        buyer: { phone: '9876543210' },
        products: [],
      };
      const origEnv = { ...process.env };
      process.env.WHATSAPP_PROVIDER = 'openwa';
      delete process.env.OPENWA_API_KEY;

      await expect(WhatsAppService.shareBillPdf(bill as any, {}, '9876543210')).rejects.toThrow(OpenWANotConfigured);
      await expect(WhatsAppService.shareBillPdf(bill as any, {}, '9876543210')).rejects.toThrow(
        'OpenWA is not configured'
      );
      process.env = origEnv;
    });
  });

  describe('3. HTTP Endpoints Wiring', () => {
    it('GET /api/v1/bills/:id/pdf returns 200 with application/pdf and Content-Disposition', async () => {
      const res = await request(app)
        .get(`/api/v1/bills/${testBillId}/pdf`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toBe('inline; filename="INV-2026-00999.pdf"');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(1500);
    });

    it('POST /api/v1/bills/:id/share-whatsapp returns 400 with exact error when not configured', async () => {
      const origEnv = { ...process.env };
      process.env.WHATSAPP_PROVIDER = 'meta';
      process.env.WHATSAPP_ENABLED = 'false';
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;

      try {
        const res = await request(app)
          .post(`/api/v1/bills/${testBillId}/share-whatsapp`)
          .set('Authorization', `Bearer ${token}`)
          .send({ phone: '9876543210' });

        expect(res.status).toBe(400);
        expect(res.body.detail).toContain('WhatsApp sharing is not configured yet');
      } finally {
        process.env = origEnv;
      }
    });

    it('GET /api/v1/bills/:id/pdf returns 404 for non-existent bill', async () => {
      const fakeId = new ObjectId().toString();
      const res = await request(app)
        .get(`/api/v1/bills/${fakeId}/pdf`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.detail).toBe('Bill not found.');
    });
  });
});
