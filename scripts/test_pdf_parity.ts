import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { BillPdfService } from '../apps/api/src/modules/bills/pdf.service.js';
import type { BillDoc } from '../apps/api/src/modules/bills/bills.repository.js';
import type { ObjectId } from 'mongodb';

const OUTPUT_DIR = path.resolve('docs/migration/evidence/pdf_parity');

// 1. Bill 1: Pakka Standard
const b1: BillDoc = {
  _id: '6ad26b3e2465e478fa8de3ae' as unknown as ObjectId,
  company_id: 'comp_1',
  bill_type: 'pakka',
  invoice_number: 'INV-2026-00001',
  created_at: new Date('2026-10-15T00:00:00.000Z'),
  buyer: {
    name: 'Acme Industrial Supplies Pvt Ltd',
    address: 'Plot 42, Electronics City, Bengaluru 560100',
    gst_number: '29ABCDE1234F1Z5',
    phone: '+91 98765 43210',
  },
  products: [
    { name: 'Industrial Steel Flange 4-inch', quantity: 10.0, unit: 'pcs', rate: 350.0, total: 3500.0, description: 'Carbon steel class 150' },
    { name: 'Rubber Gasket Ring', quantity: 20.0, unit: 'pcs', rate: 45.0, total: 900.0, description: 'High-temperature neoprene' },
    { name: 'Galvanized Hex Bolt M16', quantity: 50.0, unit: 'pcs', rate: 12.0, total: 600.0 },
  ],
  subtotal: 5000.0,
  discount: 250.0,
  gst_percentage: 18.0,
  gst_amount: 855.0,
  grand_total: 5605.0,
};

const c1 = {
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

// 2. Bill 2: Kacha No Logo
const b2: BillDoc = {
  _id: '6ad26b3e2465e478fa8de3af' as unknown as ObjectId,
  company_id: 'comp_1',
  bill_type: 'kacha',
  invoice_number: 'INV-2026-00002',
  created_at: new Date('2026-10-16T00:00:00.000Z'),
  buyer: {
    name: 'Rajesh Hardware Stores',
    address: 'Shop 12, Main Market, Hubballi 580020',
    phone: '9845012345',
  },
  products: [
    { name: 'Nylon Bushing 20mm', quantity: 15.0, unit: 'pcs', rate: 60.0, total: 900.0 },
    { name: 'Brass Fitting 1/2-inch', quantity: 10.0, unit: 'pcs', rate: 90.0, total: 900.0 },
  ],
  subtotal: 1800.0,
  discount: 100.0,
  gst_percentage: 0.0,
  gst_amount: 0.0,
  grand_total: 1700.0,
};

const c2 = {
  name: 'InsightLoop Engineering Works',
  address: '100 Feet Road, Indiranagar, Bengaluru 560038',
  phone: '+91 80 4000 1234',
  email: 'billing@insightloop.io',
  bank_name: 'State Bank of India',
  branch_name: 'MG Road',
  bank_account_number: '30981234567',
  ifsc_code: 'SBIN0000567',
};

// 3. Bill 3: Pakka Multi-Page
const p3 = Array.from({ length: 28 }, (_, i) => ({
  name: `Precision Machine Part #${String(i + 1).padStart(2, '0')}`,
  quantity: i + 1,
  unit: 'pcs',
  rate: (i + 1) * 25,
  total: (i + 1) * (i + 1) * 25,
}));
const sub3 = p3.reduce((acc, p) => acc + p.total, 0);
const b3: BillDoc = {
  _id: '6ad26b3e2465e478fa8de3b0' as unknown as ObjectId,
  company_id: 'comp_1',
  bill_type: 'pakka',
  invoice_number: 'INV-2026-00003',
  created_at: new Date('2026-10-17T00:00:00.000Z'),
  buyer: {
    name: 'Apex Heavy Manufacturing Corp',
    address: 'Industrial Area Phase II, Peenya, Bengaluru 560058',
    gst_number: '29AAACA1234A1Z9',
    phone: '080 2839 0000',
  },
  products: p3,
  subtotal: sub3,
  discount: 500.0,
  gst_percentage: 12.0,
  gst_amount: Math.round((sub3 - 500.0) * 0.12 * 100) / 100,
  grand_total: Math.round((sub3 - 500.0 + (sub3 - 500.0) * 0.12) * 100) / 100,
};

// 4. Bill 4: Kacha Multi-Page
const p4 = Array.from({ length: 26 }, (_, i) => ({
  name: `Assembly Component X-${String(i + 1).padStart(2, '0')}`,
  quantity: 5 + i,
  unit: 'units',
  rate: 40.0,
  total: (5 + i) * 40,
}));
const sub4 = p4.reduce((acc, p) => acc + p.total, 0);
const b4: BillDoc = {
  _id: '6ad26b3e2465e478fa8de3b1' as unknown as ObjectId,
  company_id: 'comp_1',
  bill_type: 'kacha',
  invoice_number: 'INV-2026-00004',
  created_at: new Date('2026-10-17T00:00:00.000Z'),
  buyer: {
    name: 'Global Exports Co',
    address: 'Whitefield Tech Zone, Bengaluru',
  },
  products: p4,
  subtotal: sub4,
  discount: 0.0,
  gst_percentage: 0.0,
  gst_amount: 0.0,
  grand_total: sub4,
};

async function main() {
  const cases = [
    { name: 'bill_1_pakka_standard', bill: b1, company: c1 },
    { name: 'bill_2_kacha_no_logo', bill: b2, company: c2 },
    { name: 'bill_3_pakka_multipage', bill: b3, company: c1 },
    { name: 'bill_4_kacha_multipage', bill: b4, company: c2 },
  ];

  for (const tc of cases) {
    const pdfBuf = await BillPdfService.renderBillPdf(tc.bill, tc.company);
    const nodePdfPath = path.join(OUTPUT_DIR, `${tc.name}_node.pdf`);
    const nodeTxtPath = path.join(OUTPUT_DIR, `${tc.name}_node.txt`);
    const nodePngPrefix = path.join(OUTPUT_DIR, `${tc.name}_node_page`);
    const djangoTxtPath = path.join(OUTPUT_DIR, `${tc.name}_django.txt`);
    const diffPath = path.join(OUTPUT_DIR, `${tc.name}_diff.txt`);

    fs.writeFileSync(nodePdfPath, pdfBuf);
    console.log(`Generated ${nodePdfPath} (${pdfBuf.length} bytes)`);

    execSync(`pdftotext -layout "${nodePdfPath}" "${nodeTxtPath}"`);
    execSync(`pdftoppm -png -r 150 "${nodePdfPath}" "${nodePngPrefix}"`);

    // Diff against Django text
    try {
      execSync(`diff -u "${djangoTxtPath}" "${nodeTxtPath}" > "${diffPath}" || true`);
      const diffContent = fs.readFileSync(diffPath, 'utf8');
      console.log(`Diff for ${tc.name}: ${diffContent.length === 0 ? 'ZERO DIFF (100% MATCH)' : `${diffContent.split('\n').length} diff lines`}`);
    } catch (err: unknown) {
      console.error(`Error diffing ${tc.name}:`, err);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
