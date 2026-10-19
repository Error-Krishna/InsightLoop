import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo } from '../src/db/mongo.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { ValidationError, NotFoundError } from '../src/utils/errors.js';

describe('Bills & Workers Exhaustive Branch Sweep', () => {
  const companyId = 'bills-exh-' + Date.now();
  const scope = { companyId, company_id: companyId };
  let db: any;

  beforeAll(async () => {
    db = await connectMongo();
  });

  afterAll(async () => {
    if (db) {
      await db.collection('bills').deleteMany({ company_id: companyId });
      await db.collection('inventory_items').deleteMany({ company_id: companyId });
      await db.collection('material_assignments').deleteMany({ company_id: companyId });
      await db.collection('pay_records').deleteMany({ company_id: companyId });
      await db.collection('workers').deleteMany({ company_id: companyId });
    }
    await closeMongo();
  });

  it('exhausts all remaining branches in bills.service.ts', async () => {
    // 1. Inventory items: item with null/default unit and cost_price
    const itemA = await InventoryService.createItem(scope, 'finished', {
      name: 'Item Alpha',
      quantity: 100,
      cost_price: 25,
      selling_price: 50,
      unit: 'pcs',
    });
    const itemB = await InventoryService.createItem(scope, 'finished', {
      name: 'Item Beta',
      quantity: 100,
      cost_price: 15,
      selling_price: 30,
      unit: 'box',
    });

    // 2. Create bill without discount, products without inventory_item_id, and with inventory_item_id
    const b1 = await BillsService.createBill(scope, 'kacha', {
      workflow: 'legacy' as any,
      buyer: { name: 'Buyer A' },
      products: [
        { name: 'Custom Product', quantity: 2, rate: 100 }, // no inventory_item_id
        { name: 'Item Alpha', quantity: 5, rate: 50, inventory_item_id: itemA.id },
      ],
    });
    expect(b1.grand_total).toBe(450);

    // 3. Update bill WITHOUT products (keeps existing products and deltas)
    const b1UpdatedNoProds = await BillsService.updateBill(scope, b1.id, {
      buyer_name: 'Buyer A Renamed',
      discount: 20,
    });
    expect(b1UpdatedNoProds.grand_total).toBe(430);

    // 4. Update bill with products having net negative delta (decreasing quantity to restore stock)
    const b1ReducedStock = await BillsService.updateBill(scope, b1.id, {
      products: [
        { name: 'Item Alpha', quantity: 2, rate: 50, inventory_item_id: itemA.id }, // from 5 down to 2 (+3 restored)
      ],
      discount: 0,
    });
    expect(b1ReducedStock.grand_total).toBe(100);
    const stockA = await InventoryRepository.findItemById(scope, itemA.id);
    expect(stockA?.quantity).toBe(98); // 100 - 2 = 98

    // 5. Update bill with products referencing a non-existent item ID (if (!item) continue branch in getStockDeltas)
    const nonExistentOid = new ObjectId().toString();
    await expect(
      BillsService.updateBill(scope, b1.id, {
        products: [
          { name: 'Phantom Item', quantity: 1, rate: 200, inventory_item_id: nonExistentOid },
        ],
      })
    ).rejects.toThrow('Insufficient stock: Item: requested 1.0 pcs, only 0.0 pcs in stock');

    // 6. Convert to pakka WITHOUT passing products (uses existing products and existing discount)
    const pakkaDefaultProds = await BillsService.convertToPakka(scope, b1.id, {
      gst_number: '27AAAAA0000A1Z5',
      gst_percentage: 18,
    });
    expect(pakkaDefaultProds.bill_type).toBe('pakka');
    expect(pakkaDefaultProds.gst_percentage).toBe(18);

    // 7. Update pakka bill WITHOUT specifying gst_percentage (keeps existing.gst_percentage)
    const pakkaKeepGst = await BillsService.updateBill(scope, pakkaDefaultProds.id, {
      notes: 'Updated notes without gst',
    } as any);
    expect(pakkaKeepGst.gst_percentage).toBe(18);

    // 8. Add transportation cost and misc cost WITH explicit dates
    const costDate = '2026-10-16T12:00:00.000Z';
    const b1WithCosts = await BillsService.addTransportationCost(scope, pakkaDefaultProds.id, {
      amount: 150,
      date: costDate,
      notes: 'Freight',
    });
    expect(b1WithCosts.transportation_cost_total).toBe(150);

    const b1WithMisc = await BillsService.addMiscCost(scope, pakkaDefaultProds.id, {
      amount: 75,
      date: costDate,
      notes: 'Packing crate',
    });
    expect(b1WithMisc.misc_cost_total).toBe(75);

    // 9. Legacy ready to deliver on bill doc
    await db.collection('bills').updateOne(
      { _id: new ObjectId(pakkaDefaultProds.id) },
      {
        $push: {
          ready_to_deliver: {
            inventory_item_id: itemA.id,
            quantity: 2,
            notes: 'Inspected boxes',
            date: costDate,
          },
        } as any,
      }
    );

    // 10. Link worker assignments and pay records to bill and check profit preview
    const worker = await WorkersService.createWorker(scope, { name: 'Profit Worker' });
    const rawProfit = await InventoryRepository.insertItem(scope, {
      name: 'Profit Raw',
      unit: 'm',
      type: 'raw',
      quantity: 50,
      cost_price: 10,
      created_at: new Date(),
    });
    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: pakkaDefaultProds.id,
      raw_item_id: rawProfit._id.toString(),
      material_name: 'Item Alpha',
      quantity: 2,
      price_per_unit: 10,
      wage_amount: 100,
    });
    await db.collection('bills').updateOne(
      { _id: new ObjectId(pakkaDefaultProds.id) },
      { $push: { worker_assignment_ids: assignment.id } }
    );

    // Add direct pay record for this bill
    await db.collection('pay_records').insertOne({
      company_id: companyId,
      worker: new ObjectId(worker.id),
      bill_id: pakkaDefaultProds.id,
      units_produced: 2,
      rate_per_unit: 50,
      amount_paid: 100,
      paid: true,
      date: new Date(),
    });

    // Error paths and note trimming for recordPayment and getProfitPreview
    await expect(BillsService.recordPayment(scope, 'invalid-id', { amount: 10 })).rejects.toThrow('Invalid bill id.');
    await expect(BillsService.recordPayment(scope, new ObjectId().toString(), { amount: 10 })).rejects.toThrow('Bill not found.');
    await expect(BillsService.recordPayment(scope, pakkaDefaultProds.id, { amount: 0 })).rejects.toThrow('Payment amount must be positive.');
    await expect(BillsService.recordPayment(scope, pakkaDefaultProds.id, { amount: -5 })).rejects.toThrow('Payment amount must be positive.');
    await expect(BillsService.getProfitPreview(scope, 'invalid-id')).rejects.toThrow('Invalid bill id.');
    await expect(BillsService.getProfitPreview(scope, new ObjectId().toString())).rejects.toThrow('Bill not found.');

    const paymentRes = await BillsService.recordPayment(scope, pakkaDefaultProds.id, {
      amount: 50,
      notes: '  payment note with whitespace  ',
    });
    expect(paymentRes.payments.some((p) => p.notes === 'payment note with whitespace')).toBe(true);

    const preview = await BillsService.getProfitPreview(scope, pakkaDefaultProds.id);
    expect(preview.cost_breakdown.material_cost).toBe(50);
    expect(preview.cost_breakdown.worker_cost).toBe(100);
    expect(preview.cost_breakdown.transportation_cost).toBe(150);
    expect(preview.cost_breakdown.misc_cost).toBe(75);
    expect(preview.cost_basis_full).toBe(375);
    expect(preview.lines.length).toBeGreaterThanOrEqual(1);
    expect(preview.lines[0].cost_known).toBe(true);
    expect(preview.lines[0].unit_cost).toBe(25);
    expect(preview.lines[0].line_cost).toBe(50);
    expect(preview.lines[0].quantity).toBe(2);
    expect(preview.lines[0].inventory_item_id).toBe(itemA.id);

    // Direct pakka bill creation with string gst_percentage
    const directPakka = await BillsService.createBill(scope, 'pakka', {
      buyer: { gst_number: '27AAAAA0000A1Z5' },
      gst_percentage: '18' as any,
      products: [{ name: 'Direct Pakka Item', quantity: 1, rate: 100 }],
    });
    expect(directPakka.gst_percentage).toBe(18);
    expect(directPakka.gst_amount).toBe(18);
    expect(directPakka.grand_total).toBe(118);

    // Duplicate key regex test (message-based error without code 11000)
    const origUpdate = BillsRepository.updateBill;
    let messageOnlyThrown = false;
    BillsRepository.updateBill = async (s: any, id: any, data: any) => {
      if (!messageOnlyThrown) {
        messageOnlyThrown = true;
        throw new Error('collection InsightLoop.bills duplicate key error index');
      }
      return origUpdate.call(BillsRepository, s, id, data);
    };
    try {
      const retryKacha = await BillsService.createBill(scope, 'kacha', { products: [{ name: 'Msg Retry', quantity: 1, rate: 10 }] });
      const converted = await BillsService.convertToPakka(scope, retryKacha.id, { gst_number: '27AAAAA0000A1Z5', gst_percentage: 18 });
      expect(converted.bill_type).toBe('pakka');
    } finally {
      BillsRepository.updateBill = origUpdate;
    }

    // Profit preview with mixed product lines (known cost, unlinked item, invalid item id)
    const mixedBill = await BillsService.createBill(scope, 'kacha', {
      workflow: 'legacy' as any,
      products: [
        { name: 'Known Item', quantity: 1, rate: 100, inventory_item_id: itemA.id },
        { name: 'Unknown Item', quantity: 2, rate: 50 },
        { name: 'Invalid ID Item', quantity: 1, rate: 25, inventory_item_id: 'not-an-oid' },
      ],
    });
    const mixedPreview = await BillsService.getProfitPreview(scope, mixedBill.id);
    const unkLine = mixedPreview.lines.find((l) => l.name === 'Unknown Item');
    expect(unkLine?.cost_known).toBe(false);
    expect(unkLine?.unit_cost).toBeNull();
    expect(unkLine?.line_cost).toBe(0);
    const invLine = mixedPreview.lines.find((l) => l.name === 'Invalid ID Item');
    expect(invLine?.cost_known).toBe(false);
    expect(invLine?.unit_cost).toBeNull();

    // 11. Delete bill without products (deltas empty)
    const emptyBill = await db.collection('bills').insertOne({
      company_id: companyId,
      bill_type: 'kacha',
      invoice_number: 'INV-EMPTY-' + Date.now(),
      products: [],
      ready_to_deliver: [],
    });
    await BillsService.deleteBill(scope, emptyBill.insertedId.toString());

    // 12. List bills with various filters (query parameter branches)
    const listAll = await BillsService.listBills(scope, {});
    expect(Array.isArray(listAll)).toBe(true);

    const listPakka = await BillsService.listBills(scope, { bill_type: 'pakka' });
    expect(listPakka.every((b) => b.bill_type === 'pakka')).toBe(true);

    const listKacha = await BillsService.listBills(scope, { bill_type: 'kacha' });
    expect(listKacha.every((b) => b.bill_type === 'kacha')).toBe(true);

    const listPaid = await BillsService.listBills(scope, { payment_status: 'unpaid' });
    expect(Array.isArray(listPaid)).toBe(true);

    const listOrder = await BillsService.listBills(scope, { order_status: 'ready' });
    expect(Array.isArray(listOrder)).toBe(true);
  });

  it('exhausts all remaining branches in workers.service.ts', async () => {
    // 1. Worker with null/zero payments and assignments
    const w1 = await WorkersService.createWorker(scope, {
      name: 'Zero Branch Worker',
      age: 40,
    });

    // Zero units pay record to test (Number(units) || 0) fallback
    await db.collection('pay_records').insertOne({
      company_id: companyId,
      worker_id: w1.id,
      units_produced: 0,
      rate_per_unit: 0,
      amount_paid: 0,
      paid: false,
      date: null,
    });

    // Assignment with null quantity and null price_per_unit
    await db.collection('material_assignments').insertOne({
      company_id: companyId,
      worker_id: w1.id,
      material_name: 'Zero Material',
      quantity: 0,
      price_per_unit: 0,
      status: 'completed',
      wastage_quantity: 0,
      batches: [{ quantity: 0, date: null }],
    });

    const wDetail = await WorkersService.getWorker(scope, w1.id);
    expect(wDetail.pending_amount).toBe(0);
    expect(wDetail.wastage_rate).toBe(0);

    // List workers
    const allWorkers = await WorkersService.listWorkers(scope);
    expect(allWorkers.length).toBeGreaterThan(0);

    // Update worker with image_url, is_active, and joining_date
    const updatedW1 = await WorkersService.updateWorker(scope, w1.id, {
      image_url: 'http://example.com/w1.jpg',
      is_active: false,
      joining_date: '2026-01-01',
    });
    expect(updatedW1.image_url).toBe('http://example.com/w1.jpg');
    expect(updatedW1.is_active).toBe(false);

    // Assignment without batches array (null batches)
    const rawAssignment = await db.collection('material_assignments').insertOne({
      company_id: companyId,
      worker_id: w1.id,
      material_name: 'No Batch Material',
      quantity: 10,
      raw_issued_quantity: 10,
      price_per_unit: 5,
      status: 'open',
      batches: null,
    });
    const fetchedAssignments = await WorkersService.listMaterials(scope, w1.id);
    const fetchedAssignment = fetchedAssignments.find((a) => a.id === rawAssignment.insertedId.toString());
    expect(fetchedAssignment?.delivered_quantity).toBe(0);

    // Add batch edge cases: null quantity, float string, and formatted date
    await WorkersService.updateWorker(scope, w1.id, { is_active: true });
    const rawBatchItem = await InventoryRepository.insertItem(scope, {
      name: 'Batch Raw',
      unit: 'pcs',
      type: 'raw',
      quantity: 50,
      cost_price: 1,
      sku: 'SKU-BATCH-' + Date.now(),
      created_at: new Date(),
    });
    const batchBill = await BillsService.createBill(scope, 'kacha', {
      buyer_name: 'Batch Buyer',
      products: [{ name: 'Batch Date Test', quantity: 10, rate: 10 }],
    });
    const dateAss = await WorkersService.createMaterial(scope, w1.id, {
      bill_id: batchBill.id,
      raw_item_id: rawBatchItem._id.toString(),
      material_name: 'Batch Date Test',
      quantity: 10,
      price_per_unit: 1,
    });
    await expect(WorkersService.addBatch(scope, dateAss.id, { quantity: null as any })).rejects.toThrow('Batch quantity must be a positive number.');
    await expect(WorkersService.addBatch(scope, dateAss.id, { quantity: '3.14' as any })).rejects.toThrow('Batch quantity must be an integer.');
    const dateBatch = await WorkersService.addBatch(scope, dateAss.id, { quantity: 2, date: '2026-10-16' });
    expect(dateBatch.delivered_quantity).toBe(2);

    // Complete assignment with deliveredQty === 0 and wage_amount === 0
    const zeroComplete = await WorkersService.completeAssignment(scope, rawAssignment.insertedId.toString());
    expect(zeroComplete.status).toBe('completed');
    expect(zeroComplete.wastage_quantity).toBe(10);
  });
});
