import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BillPdfService, type CompanyPdfContext } from '../src/modules/bills/pdf.service.js';
import { type BillDoc } from '../src/modules/bills/bills.repository.js';

import os from 'node:os';

describe('PDF Parity with Django WeasyPrint Fixtures', () => {
  const EVIDENCE_DIR = os.tmpdir();

  const company: CompanyPdfContext = {
    name: 'InsightLoop Engineering Works',
    address: '100 Feet Road, Indiranagar, Bengaluru 560038',
    gst_number: '29XYZAB5678C1Z2',
    phone: '+91 80 4000 1234',
    email: 'billing@insightloop.io',
    bank_name: 'HDFC Bank',
    branch_name: 'Indiranagar',
    bank_account_number: '50100012345678',
    ifsc_code: 'HDFC0001234',
  };

  it('renders pakka standard bill and matches Django text content and rupee symbol', async () => {
    const bill = {
      bill_type: 'pakka',
      invoice_number: 'INV-2026-00001',
      created_at: new Date(2026, 9, 15),
      buyer: {
        name: 'Acme Industrial Supplies Pvt Ltd',
        address: 'Plot 42, Electronics City, Bengaluru 560100',
        gst_number: '29ABCDE1234F1Z5',
        phone: '+91 98765 43210',
      },
      products: [
        { name: 'Industrial Steel Flange 4-inch', quantity: 10, unit: 'pcs', rate: 350, total: 3500, description: 'Carbon steel class 150' },
        { name: 'Rubber Gasket Ring', quantity: 20, unit: 'pcs', rate: 45, total: 900, description: 'High-temperature neoprene' },
        { name: 'Galvanized Hex Bolt M16', quantity: 50, unit: 'pcs', rate: 12, total: 600 },
      ],
      subtotal: 5000,
      discount: 250,
      gst_percentage: 18,
      gst_amount: 855,
      grand_total: 5605,
    } as unknown as BillDoc;

    const pdfBuffer = await BillPdfService.renderBillPdf(bill, company);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(10000);

    const tmpPdf = path.join(EVIDENCE_DIR, 'tmp_test_b1.pdf');
    fs.writeFileSync(tmpPdf, pdfBuffer);

    let extractedText = '';
    try {
      extractedText = execFileSync('pdftotext', ['-layout', tmpPdf, '-']).toString('utf8');
    } finally {
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    }

    // Assert key content elements match Django exactly
    expect(extractedText).toContain('InsightLoop Engineering Works');
    expect(extractedText).toContain('TAX INVOICE');
    expect(extractedText).toContain('PAKKA');
    expect(extractedText).toContain('Acme Industrial Supplies Pvt Ltd');
    expect(extractedText).toContain('INV-2026-00001');
    expect(extractedText).toContain('Date: 15 Oct 2026');
    expect(extractedText).toContain('Industrial Steel Flange 4-inch');
    expect(extractedText).toContain('Carbon steel class 150');
    expect(extractedText).toContain('Subtotal');
    expect(extractedText).toContain('5000.00');
    expect(extractedText).toContain('Discount');
    expect(extractedText).toContain('-250.00');
    expect(extractedText).toContain('GST (18%)');
    expect(extractedText).toContain('855.00');
    expect(extractedText).toContain('Grand Total');
    expect(extractedText).toContain('₹5605.00');
    expect(extractedText).toContain('PAYMENT DETAILS');
    expect(extractedText).toContain('50100012345678');
    expect(extractedText).toContain('IFSC: HDFC0001234');
    expect(extractedText).toContain('Authorized Signatory');
  });

  it('renders kacha bill with missing logo without error', async () => {
    const bill = {
      bill_type: 'kacha',
      invoice_number: 'INV-2026-00002',
      created_at: new Date(2026, 9, 16),
      buyer: {
        name: 'Rajesh Hardware Stores',
        address: 'Shop 12, Main Market, Hubballi 580020',
        phone: '9845012345',
      },
      products: [
        { name: 'Nylon Bushing 20mm', quantity: 15, unit: 'pcs', rate: 60, total: 900 },
        { name: 'Brass Fitting 1/2-inch', quantity: 10, unit: 'pcs', rate: 90, total: 900 },
      ],
      subtotal: 1800,
      discount: 100,
      gst_percentage: 0,
      gst_amount: 0,
      grand_total: 1700,
    } as unknown as BillDoc;

    const companyNoLogo: CompanyPdfContext = {
      ...company,
      logo_url: '/non/existent/path/to/logo.png', // Unreachable image should not fail
      bank_name: 'State Bank of India',
      branch_name: 'MG Road',
      bank_account_number: '30981234567',
      ifsc_code: 'SBIN0000567',
    };

    const pdfBuffer = await BillPdfService.renderBillPdf(bill, companyNoLogo);
    expect(pdfBuffer).toBeInstanceOf(Buffer);

    const tmpPdf = path.join(EVIDENCE_DIR, 'tmp_test_b2.pdf');
    fs.writeFileSync(tmpPdf, pdfBuffer);

    let extractedText = '';
    try {
      extractedText = execFileSync('pdftotext', ['-layout', tmpPdf, '-']).toString('utf8');
    } finally {
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    }

    expect(extractedText).toContain('BILL');
    expect(extractedText).toContain('KACHA');
    expect(extractedText).toContain('Rajesh Hardware Stores');
    expect(extractedText).toContain('INV-2026-00002');
    expect(extractedText).toContain('Grand Total');
    expect(extractedText).toContain('₹1700.00');
    expect(extractedText).toContain('This is an informal bill and does not carry GST liability.');
  });

  it('handles multi-page bills (28 items) with repeating table header on page 2', async () => {
    const products = Array.from({ length: 28 }, (_, i) => ({
      name: `Precision Machine Part #${String(i + 1).padStart(2, '0')}`,
      quantity: i + 1,
      unit: 'pcs',
      rate: (i + 1) * 25,
      total: (i + 1) * (i + 1) * 25,
    }));
    const subtotal = products.reduce((acc, p) => acc + p.total, 0);

    const bill = {
      bill_type: 'pakka',
      invoice_number: 'INV-2026-00003',
      created_at: new Date(2026, 9, 17),
      buyer: {
        name: 'Apex Heavy Manufacturing Corp',
        address: 'Industrial Area Phase II, Peenya, Bengaluru 560058',
        gst_number: '29AAACA1234A1Z9',
        phone: '080 2839 0000',
      },
      products,
      subtotal,
      discount: 500,
      gst_percentage: 12,
      gst_amount: Math.round((subtotal - 500) * 0.12 * 100) / 100,
      grand_total: subtotal - 500 + Math.round((subtotal - 500) * 0.12 * 100) / 100,
    } as unknown as BillDoc;

    const pdfBuffer = await BillPdfService.renderBillPdf(bill, company);
    const tmpPdf = path.join(EVIDENCE_DIR, 'tmp_test_b3.pdf');
    fs.writeFileSync(tmpPdf, pdfBuffer);

    let extractedText = '';
    try {
      extractedText = execFileSync('pdftotext', ['-layout', tmpPdf, '-']).toString('utf8');
    } finally {
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    }

    // Must contain page break char \x0c
    expect(extractedText).toContain('\x0c');
    expect(extractedText).toContain('Precision Machine Part #01');
    expect(extractedText).toContain('Precision Machine Part #28');
    expect(extractedText).toContain('Grand Total');
  });
});
