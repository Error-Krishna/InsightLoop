import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo, getDb, getCollection } from '../src/db/mongo.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('B5: Bills Stock Handling, Concurrency & Reconciliation', () => {
  const scope: TenantScope = { companyId: 'test-b5-company-' + Date.now() };
  let warehouseId: string;

  beforeAll(async () => {
    await connectMongo();
    const wh = await InventoryRepository.insertWarehouse(scope, {
      name: 'B5 Central Depot',
      location: 'Section B5',
      created_at: new Date(),
    });
    warehouseId = wh._id.toString();
  });

  afterAll(async () => {
    const db = getDb();
    await db.collection('bills').deleteMany({ company_id: scope.companyId });
    await db.collection('inventory_items').deleteMany({ company_id: scope.companyId });
    await db.collection('warehouses').deleteMany({ company_id: scope.companyId });
    await db.collection('workers').deleteMany({ company_id: scope.companyId });
    await db.collection('material_assignments').deleteMany({ company_id: scope.companyId });
    await db.collection('pay_records').deleteMany({ company_id: scope.companyId });
    await closeMongo();
  });

  it('reconciles inventory stock correctly on bill update', async () => {
    const item = await InventoryRepository.insertItem(scope, {
      name: 'Reconciliation Item',
      unit: 'pcs',
      type: 'finished',
      selling_price: 100,
      cost_price: 60,
      quantity: 10,
      reorder_level: 2,
      warehouse_id: warehouseId,
      sku: 'SKU-RECON-' + Date.now(),
      created_at: new Date(),
    });

    // 1. Create bill for 4 items -> stock drops to 6
    const bill = await BillsService.createBill(scope, 'pakka', {
      products: [
        {
          name: item.name,
          quantity: 4,
          rate: 100,
          inventory_item_id: item._id.toString(),
        },
      ],
      buyer_name: 'Test Buyer',
      gst_number: '29ABCDE1234F1Z5',
      gst_percentage: 18,
    });

    let currentItem = await getCollection('inventory_items').findOne({ _id: item._id });
    expect(currentItem!.quantity).toBe(6);

    // 2. Update bill to 7 items -> net delta +3, stock drops to 3
    await BillsService.updateBill(scope, bill.id, {
      products: [
        {
          name: item.name,
          quantity: 7,
          rate: 100,
          inventory_item_id: item._id.toString(),
        },
      ],
    });

    currentItem = await getCollection('inventory_items').findOne({ _id: item._id });
    expect(currentItem!.quantity).toBe(3);

    // 3. Update bill to 2 items -> net delta -5, stock restored to 8
    await BillsService.updateBill(scope, bill.id, {
      products: [
        {
          name: item.name,
          quantity: 2,
          rate: 100,
          inventory_item_id: item._id.toString(),
        },
      ],
    });

    currentItem = await getCollection('inventory_items').findOne({ _id: item._id });
    expect(currentItem!.quantity).toBe(8);

    // 4. Update bill requesting 15 items (more than 8 available) -> fails with Insufficient stock
    await expect(
      BillsService.updateBill(scope, bill.id, {
        products: [
          {
            name: item.name,
            quantity: 15,
            rate: 100,
            inventory_item_id: item._id.toString(),
          },
        ],
      })
    ).rejects.toThrow(/Insufficient stock/i);

    // Stock must remain untouched at 8
    currentItem = await getCollection('inventory_items').findOne({ _id: item._id });
    expect(currentItem!.quantity).toBe(8);

    // 5. Delete bill -> restores 2 items, stock back to 10
    await BillsService.deleteBill(scope, bill.id);
    currentItem = await getCollection('inventory_items').findOne({ _id: item._id });
    expect(currentItem!.quantity).toBe(10);
  });

  it('prevents overselling under 50 concurrent racing buyers', async () => {
    // Inventory item with only 10 in stock
    const item = await InventoryRepository.insertItem(scope, {
      name: 'Flash Sale Item',
      unit: 'pcs',
      type: 'finished',
      selling_price: 50,
      cost_price: 30,
      quantity: 10,
      reorder_level: 2,
      warehouse_id: warehouseId,
      sku: 'SKU-FLASH-' + Date.now(),
      created_at: new Date(),
    });

    // 50 concurrent buyers each attempting to create a bill for 1 item
    const attempts = Array.from({ length: 50 }, (_, i) =>
      BillsService.createBill(scope, 'pakka', {
        products: [
          {
            name: item.name,
            quantity: 1,
            rate: 50,
            inventory_item_id: item._id.toString(),
          },
        ],
        buyer_name: `Buyer ${i}`,
      })
        .then(() => ({ success: true }))
        .catch((err) => ({ success: false, error: (err as Error).message }))
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Exactly 10 must succeed, 40 must fail
    expect(successes.length).toBe(10);
    expect(failures.length).toBe(40);

    // Stock must be exactly 0, never negative
    const finalItem = await getCollection('inventory_items').findOne({ _id: item._id });
    expect(finalItem!.quantity).toBe(0);
  });

  it('MaterialAssignment.complete() creates finished inventory if none exists, matching Django', async () => {
    const worker = await WorkersRepository.insertWorker(scope, {
      name: 'Craftsman Bob',
      is_active: true,
      created_at: new Date(),
    });

    const uniqueMaterialName = 'Handmade Clock ' + Date.now();

    // Ensure item does not exist in inventory beforehand
    const preExisting = await getCollection('inventory_items').findOne({
      company_id: scope.companyId,
      name: uniqueMaterialName,
    });
    expect(preExisting).toBeNull();

    // Create assignment and complete it
    const assignment = await WorkersService.createMaterial(scope, worker._id.toString(), {
      material_name: uniqueMaterialName,
      quantity: 10,
      price_per_unit: 100,
      wage_amount: 500,
    });

    await WorkersService.addBatch(scope, assignment.id, { quantity: 10 });
    await WorkersService.completeAssignment(scope, assignment.id);

    // Verify Finished Goods InventoryItem was auto-created with quantity 10
    const finishedItem = await getCollection('inventory_items').findOne({
      company_id: scope.companyId,
      name: uniqueMaterialName,
      type: 'finished',
    });
    expect(finishedItem).toBeDefined();
    expect(finishedItem!.quantity).toBe(10);
  });

  it('dual-stack cross-compatibility: 50 concurrent buyers, zero negative inventory, cross-stack purchase & restoration', async () => {
    // 1. Django creates a finished goods inventory item with 10 units
    const itemSku = 'SKU-DUAL-STOCK-' + Date.now();
    const itemName = 'Dual Stock Widget ' + Date.now();

    const insertResult = await getCollection('inventory_items').insertOne({
      company_id: scope.companyId,
      name: itemName,
      unit: 'pcs',
      type: 'finished',
      selling_price: 150,
      cost_price: 90,
      quantity: 10,
      reorder_level: 2,
      warehouse_id: new ObjectId(warehouseId),
      sku: itemSku,
      created_at: new Date(),
    });
    const itemId = insertResult.insertedId;

    // 2. 50 concurrent buyers compete for the 10 units
    const attempts = Array.from({ length: 50 }, (_, i) =>
      BillsService.createBill(scope, 'kacha', {
        products: [
          {
            name: itemName,
            quantity: 1,
            rate: 150,
            inventory_item_id: itemId.toString(),
          },
        ],
        buyer_name: `Concurrent Dual Buyer ${i}`,
      })
        .then((b) => ({ success: true, billId: b.id }))
        .catch((err) => ({ success: false, error: (err as Error).message }))
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Exactly 10 units sold, 40 rejected with 400 Insufficient stock
    expect(successes.length).toBe(10);
    expect(failures.length).toBe(40);
    for (const f of failures) {
      expect(f.error).toMatch(/Insufficient stock/i);
    }

    // Zero negative inventory
    let currentItem = await getCollection('inventory_items').findOne({ _id: itemId });
    expect(currentItem!.quantity).toBe(0);

    // 3. Further buy attempt is rejected
    await expect(
      BillsService.createBill(scope, 'kacha', {
        products: [
          {
            name: itemName,
            quantity: 1,
            rate: 150,
            inventory_item_id: itemId.toString(),
          },
        ],
        buyer_name: 'Late Buyer',
      })
    ).rejects.toThrow(/Insufficient stock/i);

    // 4. Node deletes one winning bill -> stock restored to 1
    const winningBillId = successes[0].billId!;
    await BillsService.deleteBill(scope, winningBillId);

    currentItem = await getCollection('inventory_items').findOne({ _id: itemId });
    expect(currentItem!.quantity).toBe(1);

    // 5. Now another buyer can successfully purchase that 1 restored unit
    const finalBill = await BillsService.createBill(scope, 'kacha', {
      products: [
        {
          name: itemName,
          quantity: 1,
          rate: 150,
          inventory_item_id: itemId.toString(),
        },
      ],
      buyer_name: 'Restored Unit Buyer',
    });
    expect(finalBill).toBeDefined();

    currentItem = await getCollection('inventory_items').findOne({ _id: itemId });
    expect(currentItem!.quantity).toBe(0);
  });
});

