import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo, getDb, getCollection } from '../src/db/mongo.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('B6: Invoice / SKU Counter Drift & Concurrency Resilience', () => {
  const scope: TenantScope = { companyId: 'test-b6-company-' + Date.now() };

  beforeAll(async () => {
    await connectMongo();
    // Ensure unique indexes exist on bills and inventory_items
    const db = getDb();
    await db.collection('bills').createIndex({ company_id: 1, invoice_number: 1 }, { unique: true });
    await db.collection('inventory_items').createIndex({ company_id: 1, sku: 1 }, { unique: true });
  });

  afterAll(async () => {
    const db = getDb();
    await db.collection('bills').deleteMany({ company_id: scope.companyId });
    await db.collection('inventory_items').deleteMany({ company_id: scope.companyId });
    await db.collection('counters').deleteMany({
      _id: { $in: [`invoice_${scope.companyId}_${new Date().getFullYear()}`, `sku_${scope.companyId}`] as any },
    });
    await closeMongo();
  });

  it('generates strictly unique invoice numbers under 20 parallel creates with zero 500s', async () => {
    const parallelCount = 20;

    const creates = Array.from({ length: parallelCount }, (_, i) =>
      BillsService.createBill(scope, 'kacha', {
        products: [
          {
            name: `Widget ${i}`,
            quantity: 1,
            rate: 50,
          },
        ],
        buyer_name: `Buyer ${i}`,
      })
    );

    const bills = await Promise.all(creates);
    expect(bills.length).toBe(parallelCount);

    const invoiceNumbers = bills.map((b) => b.invoice_number);
    const uniqueNumbers = new Set(invoiceNumbers);

    // Every bill must have a strictly unique invoice number
    expect(uniqueNumbers.size).toBe(parallelCount);

    // Verify format and consecutive monotonic sequence
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const sequences = invoiceNumbers.map((inv) => {
      expect(inv.startsWith(prefix)).toBe(true);
      return parseInt(inv.slice(prefix.length), 10);
    });

    sequences.sort((a, b) => a - b);
    for (let i = 0; i < sequences.length; i++) {
      expect(sequences[i]).toBe(i + 1);
    }
  });

  it('resyncs invoice counter when external system (Django) inserts higher invoice number', async () => {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const jumpedSeq = 500;
    const jumpedInvoice = `${prefix}${String(jumpedSeq).padStart(5, '0')}`;

    // Simulate external insertion into bills collection
    await getCollection('bills').insertOne({
      company_id: scope.companyId,
      bill_type: 'kacha',
      invoice_number: jumpedInvoice,
      products: [],
      subtotal: 0,
      grand_total: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Create a new bill via Node
    const nextBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Post-Jump Item', quantity: 1, rate: 100 }],
      buyer_name: 'Post-Jump Buyer',
    });

    const expectedInvoice = `${prefix}${String(jumpedSeq + 1).padStart(5, '0')}`;
    expect(nextBill.invoice_number).toBe(expectedInvoice);
  });

  it('generates strictly unique SKUs under 20 parallel item creates with zero collisions', async () => {
    const parallelCount = 20;

    const creates = Array.from({ length: parallelCount }, (_, i) =>
      InventoryService.createItem(scope, 'finished', {
        name: `Parallel SKU Item ${i}`,
        type: 'finished',
        cost_price: 20,
        selling_price: 40,
        unit: 'pcs',
        quantity: 5,
      })
    );

    const items = await Promise.all(creates);
    expect(items.length).toBe(parallelCount);

    const skus = items.map((item) => item.sku);
    const uniqueSkus = new Set(skus);

    // All SKUs must be unique
    expect(uniqueSkus.size).toBe(parallelCount);
    for (const sku of skus) {
      expect(sku).toMatch(/^SKU-\d{5}$/);
    }
  });

  it('resyncs SKU counter when external item with higher SKU is inserted', async () => {
    const jumpedSkuNum = 800;
    const jumpedSku = `SKU-${String(jumpedSkuNum).padStart(5, '0')}`;

    // Simulate external insertion (e.g. Django)
    await getCollection('inventory_items').insertOne({
      company_id: scope.companyId,
      name: 'External Item',
      type: 'finished',
      cost_price: 10,
      selling_price: 20,
      quantity: 1,
      sku: jumpedSku,
      created_at: new Date(),
    });

    // Node creates item without specifying SKU -> must resync to 801
    const newItem = await InventoryService.createItem(scope, 'finished', {
      name: 'Resynced Item',
      type: 'finished',
      cost_price: 15,
      selling_price: 30,
      unit: 'pcs',
      quantity: 2,
    });

    const expectedSku = `SKU-${String(jumpedSkuNum + 1).padStart(5, '0')}`;
    expect(newItem.sku).toBe(expectedSku);
  });
});
