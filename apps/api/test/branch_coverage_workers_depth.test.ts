import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo, getDb } from '../src/db/mongo.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('Workers & Bills Deep Branch Coverage Suite', () => {
  const scope: TenantScope = { companyId: 'test-workers-depth-' + Date.now() };
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    await connectMongo();
    db = getDb();
  });

  afterAll(async () => {
    await db.collection('bills').deleteMany({ company_id: scope.companyId });
    await db.collection('inventory_items').deleteMany({ company_id: scope.companyId });
    await db.collection('workers').deleteMany({ company_id: scope.companyId });
    await db.collection('material_assignments').deleteMany({ company_id: scope.companyId });
    await db.collection('pay_records').deleteMany({ company_id: scope.companyId });
    await db.collection('stock_movements').deleteMany({ company_id: scope.companyId });
    await closeMongo();
  });

  it('WorkersRepository: exercises ObjectId instance branches and sync claims', async () => {
    const dummyId = new ObjectId();
    expect(await WorkersRepository.findAssignmentById(scope, dummyId)).toBeNull();
    expect(await WorkersRepository.updateAssignment(scope, dummyId, { status: 'open' })).toBeNull();
    expect(await WorkersRepository.addBatchToAssignment(scope, dummyId, { quantity: 1 })).toBeNull();
    expect(await WorkersRepository.claimCompletingAssignment(scope, dummyId, 0)).toBeNull();
    expect(await WorkersRepository.claimCancellingAssignment(scope, dummyId, 0)).toBeNull();
    expect(await WorkersRepository.claimBatchSync(scope, dummyId, 'b1', 'it1')).toBe(false);
    expect(await WorkersRepository.unclaimBatchSync(scope, dummyId, 'b1')).toBeUndefined();
    await WorkersRepository.deleteAssignmentById(scope, dummyId);

    // Also string id
    expect(await WorkersRepository.claimBatchSync(scope, dummyId.toString(), 'b1', 'it1')).toBe(false);
    expect(await WorkersRepository.unclaimBatchSync(scope, dummyId.toString(), 'b1')).toBeUndefined();
    await WorkersRepository.deleteAssignmentById(scope, dummyId.toString());
  });

  it('WorkersService.serializeAssignment: covers transient statuses, batches, raw issues, and worker shapes', () => {
    const svc = WorkersService as any;

    // Transient completing -> serialized as open
    const completing = svc.serializeAssignment({
      _id: new ObjectId(),
      company_id: scope.companyId,
      status: 'completing',
      material_name: 'Test Mat',
      worker: new ObjectId(),
      raw_issues: [{ issue_id: 'i1', quantity: 5, date: '2026-01-01', notes: 'sample' }],
      batches: [{ batch_id: 'b1', quantity: 2, date: '2026-01-02', notes: 'note', synced_to_inventory: true }],
    });
    expect(completing.status).toBe('open');
    expect(completing.raw_issues[0].notes).toBe('sample');
    expect(completing.batches[0].synced_to_inventory).toBe(true);

    // Transient cancelling -> serialized as open
    const cancelling = svc.serializeAssignment({
      _id: new ObjectId(),
      company_id: scope.companyId,
      status: 'cancelling',
      material_name: 'Test Mat 2',
      worker: 'worker-string-id',
      raw_issues: [{ quantity: 3 }],
      batches: [{ quantity: 1 }],
    });
    expect(cancelling.status).toBe('open');
    expect(cancelling.worker_id).toBe('worker-string-id');

    // Worker as object with _id
    const objWorker = svc.serializeAssignment({
      _id: new ObjectId(),
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Test Mat 3',
      worker: { _id: new ObjectId(), name: 'Sub Worker' },
    });
    expect(objWorker.worker_name).toBe('Sub Worker');
  });

  it('WorkersService.createMaterial: covers input validation branches', async () => {
    const worker = await WorkersService.createWorker(scope, { name: 'Validation Worker' });

    // Non-integer target quantity
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: new ObjectId().toString(),
        raw_item_id: new ObjectId().toString(),
        material_name: 'Item',
        quantity: 5.5,
      })
    ).rejects.toThrow('Target quantity must be a positive integer.');

    // Missing bill_id
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        raw_item_id: new ObjectId().toString(),
        material_name: 'Item',
        quantity: 5,
      } as any)
    ).rejects.toThrow('Valid bill_id is required.');

    // Invalid bill_id
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: 'not-valid-oid',
        raw_item_id: new ObjectId().toString(),
        material_name: 'Item',
        quantity: 5,
      })
    ).rejects.toThrow('Invalid bill id.');

    // Bill not found
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: new ObjectId().toString(),
        raw_item_id: new ObjectId().toString(),
        material_name: 'Item',
        quantity: 5,
      })
    ).rejects.toThrow('That bill was not found for this company.');

    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'V-Chair', quantity: 10, rate: 100 }],
    });

    // Product line not found in bill
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: new ObjectId().toString(),
        material_name: 'Nonexistent Product',
        quantity: 5,
      })
    ).rejects.toThrow('Product "Nonexistent Product" does not match any line in the specified bill.');

    // Missing raw_item_id
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        material_name: 'V-Chair',
        quantity: 5,
      } as any)
    ).rejects.toThrow('Valid raw_item_id is required.');

    // Invalid raw_item_id format
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: 'invalid-id',
        material_name: 'V-Chair',
        quantity: 5,
      })
    ).rejects.toThrow('Valid raw_item_id is required.');

    // Non-raw item
    const finishedItem = await InventoryService.createItem(scope, 'finished', {
      name: 'Finished Desk',
    });
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: finishedItem.id,
        material_name: 'V-Chair',
        quantity: 5,
      })
    ).rejects.toThrow('Raw inventory item not found or is not of type raw.');

    // Invalid raw_per_unit <= 0
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'V-Wood',
      quantity: 100,
    });
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'V-Chair',
        quantity: 5,
        raw_per_unit: -1,
      })
    ).rejects.toThrow('raw_per_unit must be greater than 0.');

    // Negative issue_quantity
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'V-Chair',
        quantity: 5,
        issue_quantity: -5,
      })
    ).rejects.toThrow('Issue quantity cannot be negative.');

    // Negative wage_amount
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'V-Chair',
        quantity: 5,
        wage_amount: -10,
      })
    ).rejects.toThrow('Wage amount cannot be negative.');

    // Issue quantity > available stock
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'V-Chair',
        quantity: 5,
        issue_quantity: 500,
      })
    ).rejects.toThrow(/Insufficient raw stock/);
  });

  it('WorkersService.createMaterial: covers concurrency line target limit rollback', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Conc Raw Wood',
      quantity: 100,
    });
    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Conc Stool', quantity: 5, rate: 200 }],
    });
    const worker = await WorkersService.createWorker(scope, { name: 'Conc Worker' });

    // First call passes pre-check; second call simulates concurrent insert exceeding cap
    vi.spyOn(WorkersRepository, 'findActiveAssignmentsForBill')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          _id: new ObjectId(),
          company_id: scope.companyId,
          status: 'open',
          material_name: 'Conc Stool',
          quantity: 10, // Exceeds 5
        } as any,
      ]);

    try {
      await expect(
        WorkersService.createMaterial(scope, worker.id, {
          bill_id: bill.id,
          raw_item_id: raw.id,
          material_name: 'Conc Stool',
          quantity: 2,
          issue_quantity: 2,
        })
      ).rejects.toThrow(/Concurrent assignment creation exceeded/);

      // Raw stock was restored to 100
      const checkRaw = await InventoryRepository.findItemById(scope, raw.id);
      expect(checkRaw?.quantity).toBe(100);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('WorkersService.issueRawMaterial: covers validation, insufficient stock, and success', async () => {
    const dummyId = new ObjectId().toString();

    // Invalid ObjectId
    await expect(
      WorkersService.issueRawMaterial(scope, 'bad-id', { quantity: 10 })
    ).rejects.toThrow('Invalid material assignment id.');

    // Assignment not found
    await expect(
      WorkersService.issueRawMaterial(scope, dummyId, { quantity: 10 })
    ).rejects.toThrow('Material assignment not found.');

    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Issue Test Raw',
      quantity: 50,
    });
    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Issue Bench', quantity: 10, rate: 150 }],
    });
    const worker = await WorkersService.createWorker(scope, { name: 'Issue Worker' });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Issue Bench',
      quantity: 10,
      issue_quantity: 10,
    });

    // Quantity <= 0
    await expect(
      WorkersService.issueRawMaterial(scope, assignment.id, { quantity: 0 })
    ).rejects.toThrow('Issue quantity must be a positive number.');

    // Quantity > available stock (50 - 10 = 40)
    await expect(
      WorkersService.issueRawMaterial(scope, assignment.id, { quantity: 100 })
    ).rejects.toThrow(/Insufficient raw stock/);

    // Successful issue with custom date and notes
    const issued = await WorkersService.issueRawMaterial(scope, assignment.id, {
      quantity: 15,
      date: '2026-05-01T00:00:00.000Z',
      notes: 'Extra raw batch',
    });
    expect(issued.raw_issued_quantity).toBe(25);
    expect(issued.raw_issues?.length).toBe(2);

    // Cancel assignment -> not open anymore
    await WorkersService.completeAssignment(scope, assignment.id);
    await expect(
      WorkersService.issueRawMaterial(scope, assignment.id, { quantity: 5 })
    ).rejects.toThrow('Cannot issue raw material to a non-open assignment.');
  });

  it('WorkersService.addBatch: covers retry and error branches', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Batch Retry Raw',
      quantity: 50,
    });
    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Batch Table', quantity: 5, rate: 300 }],
    });
    const worker = await WorkersService.createWorker(scope, { name: 'Batch Worker' });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Batch Table',
      quantity: 5,
      issue_quantity: 5,
    });

    // 1. Simulate stock increment failure (e.g. adjustStockById throws):
    vi.spyOn(InventoryRepository, 'adjustStockById').mockRejectedValueOnce(new Error('Simulated stock error'));
    const failedSyncBatch = await WorkersService.addBatch(scope, assignment.id, { quantity: 2 });
    expect(failedSyncBatch.batches?.[0].synced_to_inventory).toBe(false);

    // 2. Simulate markBatchSynced first attempt failure, second attempt success
    vi.spyOn(WorkersRepository, 'markBatchSynced')
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValueOnce({} as any);

    const retrySuccess = await WorkersService.addBatch(scope, assignment.id, { quantity: 1 });
    expect(retrySuccess).toBeDefined();

    // 3. Simulate markBatchSynced both attempts failure
    vi.spyOn(WorkersRepository, 'markBatchSynced')
      .mockRejectedValue(new Error('Permanent failure'));

    const critFailed = await WorkersService.addBatch(scope, assignment.id, { quantity: 1 });
    expect(critFailed).toBeDefined();

    vi.restoreAllMocks();
  });

  it('WorkersService.completeAssignment: covers unsynced batch sync and rollback on error', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Complete Catchup Raw',
      quantity: 50,
    });
    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Complete Desk', quantity: 4, rate: 500 }],
    });
    const worker = await WorkersService.createWorker(scope, { name: 'Complete Worker' });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Complete Desk',
      quantity: 4,
      issue_quantity: 4,
    });

    // Add batch with simulated failed sync
    vi.spyOn(InventoryRepository, 'adjustStockById').mockRejectedValueOnce(new Error('Simulated batch sync fail'));
    await WorkersService.addBatch(scope, assignment.id, { quantity: 2 });
    vi.restoreAllMocks();

    // Validation: raw_returned_quantity < 0
    await expect(
      WorkersService.completeAssignment(scope, assignment.id, { raw_returned_quantity: -1 })
    ).rejects.toThrow(/Raw returned quantity must be between 0/);

    // Validation: raw_returned_quantity > maxReturnable
    await expect(
      WorkersService.completeAssignment(scope, assignment.id, { raw_returned_quantity: 100 })
    ).rejects.toThrow(/Raw returned quantity must be between 0/);

    // Simulate error during completeAssignment (after claim) to test rollback logic
    vi.spyOn(WorkersRepository, 'linkBillWorkerAssignment').mockRejectedValueOnce(new Error('Simulated link fail'));

    await expect(
      WorkersService.completeAssignment(scope, assignment.id, { raw_returned_quantity: 1 })
    ).rejects.toThrow('Simulated link fail');

    // Assignment status was rolled back to 'open'
    const rolledBack = await WorkersRepository.findAssignmentById(scope, assignment.id);
    expect(rolledBack?.status).toBe('open');

    vi.restoreAllMocks();

    // Now complete successfully: it catches up the unsynced batch!
    const completed = await WorkersService.completeAssignment(scope, assignment.id, { raw_returned_quantity: 1 });
    expect(completed.status).toBe('completed');

    const finished = await InventoryRepository.findItemByNameAndType(scope, 'Complete Desk', 'finished');
    expect(finished?.quantity).toBe(2);
  });

  it('WorkersService.cancelAssignment: covers rollback on error', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Cancel Rollback Raw',
      quantity: 50,
    });
    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Cancel Stool', quantity: 3, rate: 100 }],
    });
    const worker = await WorkersService.createWorker(scope, { name: 'Cancel Worker' });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Cancel Stool',
      quantity: 3,
      issue_quantity: 3,
    });

    // Simulate error in updateAssignment during cancel
    vi.spyOn(WorkersRepository, 'updateAssignment').mockRejectedValueOnce(new Error('Simulated update fail'));

    await expect(
      WorkersService.cancelAssignment(scope, assignment.id)
    ).rejects.toThrow('Simulated update fail');

    vi.restoreAllMocks();

    // Rolled back to open
    const rolledBack = await WorkersRepository.findAssignmentById(scope, assignment.id);
    expect(rolledBack?.status).toBe('open');
  });

  it('WorkersService pay records: covers recordPartialPayment and markPaymentPaid error branches', async () => {
    const dummyId = new ObjectId().toString();

    // Invalid id
    await expect(WorkersService.recordPartialPayment(scope, 'bad', 50)).rejects.toThrow('Invalid payment id.');
    await expect(WorkersService.markPaymentPaid(scope, 'bad')).rejects.toThrow('Invalid payment id.');

    // Not found
    await expect(WorkersService.recordPartialPayment(scope, dummyId, 50)).rejects.toThrow('Payment record not found.');
    await expect(WorkersService.markPaymentPaid(scope, dummyId)).rejects.toThrow('Payment record not found.');

    const worker = await WorkersService.createWorker(scope, { name: 'Pay Worker' });
    const payment = await WorkersService.createPayment(scope, worker.id, {
      product_name: 'Handicraft',
      units_produced: 10,
      rate_per_unit: 20, // 200 total
      amount_paid: 50,
      date: '2026-06-01',
    });

    // Record partial payment
    const partial = await WorkersService.recordPartialPayment(scope, payment.id, 50);
    expect(partial.amount_paid).toBe(100);
    expect(partial.paid).toBe(false);

    // Mark paid
    const full = await WorkersService.markPaymentPaid(scope, payment.id);
    expect(full.paid).toBe(true);
    expect(full.amount_paid).toBe(200);

    // Recording partial payment on already fully paid record throws
    await expect(WorkersService.recordPartialPayment(scope, payment.id, 10)).rejects.toThrow('This payment record is already fully paid.');

    // Amount <= 0 on unpaid record
    const payment2 = await WorkersService.createPayment(scope, worker.id, {
      product_name: 'Handicraft 2',
      units_produced: 5,
      rate_per_unit: 20,
    });
    await expect(WorkersService.recordPartialPayment(scope, payment2.id, 0)).rejects.toThrow('Payment amount must be a positive number.');
  });

  it('BillsService: covers guard branches and profit preview branches', async () => {
    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Guard Chair', quantity: 10, rate: 100 }],
    });
    const worker = await WorkersService.createWorker(scope, { name: 'Guard Worker' });
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Guard Wood',
      quantity: 50,
      cost_price: 20,
    });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Guard Chair',
      quantity: 5,
      issue_quantity: 5,
    });

    // 1. Cannot rename/remove product line in order_first bill when assignments exist
    await expect(
      BillsService.updateBill(scope, bill.id, {
        products: [{ name: 'Renamed Chair', quantity: 10, rate: 100 }],
      })
    ).rejects.toThrow(/Cannot remove or rename product/);

    // 2. Profit preview when open assignments exist -> has_open_assignments is true
    const preview = await BillsService.getProfitPreview(scope, bill.id);
    expect(preview.has_open_assignments).toBe(true);

    // 3. Complete assignment and produce items
    await WorkersService.addBatch(scope, assignment.id, { quantity: 5 });
    await WorkersService.completeAssignment(scope, assignment.id);

    // 4. Shipment: ship 2
    const s1 = await BillsService.createShipment(scope, bill.id, {
      items: [{ product_name: 'Guard Chair', quantity: 2 }],
    });
    expect(s1.order_status).toBe('partially_shipped');

    // 5. Cannot lower quantity below shipped (2) or targeted (5)
    await expect(
      BillsService.updateBill(scope, bill.id, {
        products: [{ name: 'Guard Chair', quantity: 4, rate: 100 }],
      })
    ).rejects.toThrow(/Cannot lower quantity for product "Guard Chair" below 5/);

    // 6. Shipments error branches
    // Shipment item not in bill
    await expect(
      BillsService.createShipment(scope, bill.id, {
        items: [{ product_name: 'Nonexistent Product', quantity: 1 }],
      })
    ).rejects.toThrow('Product "Nonexistent Product" is not part of this order.');

    // Shipment with empty items when ship_all is false
    await expect(
      BillsService.createShipment(scope, bill.id, {
        items: [],
      })
    ).rejects.toThrow('No items specified to ship.');

    // ship_all: true when remaining ready_to_ship > 0 works
    const s2 = await BillsService.createShipment(scope, bill.id, { ship_all: true });
    expect(s2.order_status).toBe('partially_shipped');

    // ship_all: true when nothing ready to ship throws
    await expect(
      BillsService.createShipment(scope, bill.id, { ship_all: true })
    ).rejects.toThrow('No products are ready to ship.');

    // 7. Costs and payment error branches
    const dummyId = new ObjectId().toString();
    await expect(BillsService.recordPayment(scope, 'bad', { amount: 10 })).rejects.toThrow('Invalid bill id.');
    await expect(BillsService.recordPayment(scope, dummyId, { amount: 10 })).rejects.toThrow('Bill not found.');
    await expect(BillsService.addTransportationCost(scope, 'bad', { amount: 10 })).rejects.toThrow('Invalid bill id.');
    await expect(BillsService.addTransportationCost(scope, dummyId, { amount: 10 })).rejects.toThrow('Bill not found.');
    await expect(BillsService.addMiscCost(scope, 'bad', { amount: 10 })).rejects.toThrow('Invalid bill id.');
    await expect(BillsService.addMiscCost(scope, dummyId, { amount: 10 })).rejects.toThrow('Bill not found.');
    await expect(BillsService.createShipment(scope, 'bad', { ship_all: true })).rejects.toThrow('Invalid bill id.');
    await expect(BillsService.createShipment(scope, dummyId, { ship_all: true })).rejects.toThrow('Bill not found.');
    await expect(BillsService.reopenProfit(scope, 'bad')).rejects.toThrow('Invalid bill id.');
    await expect(BillsService.reopenProfit(scope, dummyId)).rejects.toThrow('Bill not found.');

    // Reopen profit
    const reopened = await BillsService.reopenProfit(scope, bill.id);
    expect(reopened.profit_confirmed).toBe(false);

    // convertToPakka on pakka bill throws
    const pakkaBill = await BillsService.createBill(scope, 'pakka', {
      products: [{ name: 'Pakka Desk', quantity: 1, rate: 200 }],
      gst_number: '29ABCDE1234F1Z5',
      gst_percentage: 18,
    });
    await expect(
      BillsService.convertToPakka(scope, pakkaBill.id, { gst_number: '29ABCDE1234F1Z5' })
    ).rejects.toThrow('Bill is already a pakka (formal) bill.');

    // convertToPakka without gst_number throws
    await expect(
      BillsService.convertToPakka(scope, bill.id, { gst_number: '' })
    ).rejects.toThrow('GST number is required to convert to pakka.');

    // deleteBill on non-existent bill throws
    await expect(BillsService.deleteBill(scope, dummyId)).rejects.toThrow('Bill not found.');

    // Legacy bill delete restores stock
    const legacyItem = await InventoryService.createItem(scope, 'finished', {
      name: 'Legacy Stock Item',
      quantity: 10,
    });
    const legacyBill = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      bill_type: 'kacha',
      workflow: 'legacy',
      invoice_number: 'LEG-STOCK-01',
      products: [
        { name: 'Legacy Stock Item', quantity: 4, rate: 50, inventory_item_id: legacyItem.id },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    });
    await BillsService.deleteBill(scope, legacyBill.insertedId.toString());
    const restoredItem = await InventoryRepository.findItemById(scope, legacyItem.id);
    expect(restoredItem?.quantity).toBe(14);

    // InventoryRepository branch coverage
    const oid = new ObjectId();
    await InventoryRepository.findStockMovements(scope, oid.toString(), 10);
    await InventoryRepository.findStockMovements(scope, undefined, 10);
    expect(await InventoryRepository.findItemById(scope, oid)).toBeNull();
    expect(await InventoryRepository.findWarehouseById(scope, oid)).toBeNull();
    await InventoryRepository.deleteStockMovementById(scope, oid);
    await InventoryRepository.adjustStockById(scope, oid, 5);
    await InventoryRepository.adjustStockConditional(scope, oid, 5, 0);

    // BillsService branches: full options in create, update, convertToPakka
    const fullBill = await BillsService.createBill(scope, 'kacha', {
      buyer_name: '  Buyer Full  ',
      buyer_phone: ' 9876543210 ',
      buyer_address: ' 123 Full St ',
      gst_number: '29TEST1234F1Z5',
      gst_percentage: 12,
      discount: 50,
      products: [{ name: 'Full Line 1', quantity: 2, rate: 100 }],
    });
    expect(fullBill.buyer?.name).toBe('  Buyer Full  ');

    // Update with full options
    const updatedFull = await BillsService.updateBill(scope, fullBill.id, {
      buyer_name: '  Updated Buyer  ',
      buyer_phone: ' 1122334455 ',
      buyer_address: ' 456 Updated St ',
      gst_number: '29TEST9999F1Z9',
      gst_percentage: 18,
      discount: 20,
    });
    expect(updatedFull.buyer?.name).toBe('  Updated Buyer  ');

    // convertToPakka with full fields
    const convPakka = await BillsService.convertToPakka(scope, fullBill.id, {
      gst_number: '29NEWPAKKA1234',
      buyer_name: ' Pakka Name ',
      buyer_phone: ' 5555555555 ',
      buyer_address: ' Pakka Address ',
      gst_percentage: 18,
      discount: 10,
    });
    expect(convPakka.bill_type).toBe('pakka');

    // BillsService.serializeBillSync fallbacks
    const bsvc = BillsService as any;
    const minimalSerialized = bsvc.serializeBillSync({
      _id: new ObjectId(),
      company_id: scope.companyId,
      bill_type: 'kacha',
      buyer: {},
      products: [{ name: 'Test P', quantity: null, rate: null, total: null, description: null }],
      shipments: [{ shipment_id: 's1', date: new Date(), notes: null, items: [{ product_name: 'Test P', quantity: null }] }],
      payments: [{ amount: null, date: '2026-01-01', notes: null }],
      transportation_costs: [{ amount: null, notes: null }],
      misc_costs: [{ amount: null, notes: null }],
      ready_to_deliver: [{ quantity: null, item_name: null, notes: null }],
      profit_suggested_amount: null,
      profit_confirmed_amount: null,
      subtotal: null,
      gst_percentage: null,
      gst_amount: null,
      discount: null,
      invoice_number: null,
      worker_assignment_ids: null,
    }, []);
    expect(minimalSerialized.subtotal).toBe(0);

    const buyerSerialized = bsvc.serializeBillSync({
      _id: new ObjectId(),
      company_id: scope.companyId,
      bill_type: 'pakka',
      buyer: { name: 'B', address: 'A', gst_number: 'G', phone: 'P' },
      profit_suggested_amount: 100,
      profit_confirmed_amount: 120,
    }, []);
    expect(buyerSerialized.buyer.name).toBe('B');

    // Transportation and misc costs
    await expect(BillsService.addTransportationCost(scope, fullBill.id, { amount: -5 })).rejects.toThrow('Amount must be positive.');
    const tCost = await BillsService.addTransportationCost(scope, fullBill.id, { amount: 100, notes: 'Trucking' });
    expect(tCost.transportation_costs?.length).toBe(1);

    await expect(BillsService.addMiscCost(scope, fullBill.id, { amount: -5 })).rejects.toThrow('Amount must be positive.');
    const mCost = await BillsService.addMiscCost(scope, fullBill.id, { amount: 50, notes: 'Tea & Snacks' });
    expect(mCost.misc_costs?.length).toBe(1);

    // Shipment with tracking, carrier, notes
    const shipBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Ship Line', quantity: 5, rate: 100 }],
    });
    const sRaw = await InventoryService.createItem(scope, 'raw', { name: 'Ship Raw', quantity: 20 });
    const sAss = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: shipBill.id,
      raw_item_id: sRaw.id,
      material_name: 'Ship Line',
      quantity: 5,
      issue_quantity: 5,
    });
    await WorkersService.addBatch(scope, sAss.id, { quantity: 5 });
    const fullShip = await BillsService.createShipment(scope, shipBill.id, {
      items: [{ product_name: ' Ship Line ', quantity: 2 }],
      tracking_number: 'TRACK-123',
      shipping_carrier: 'FedEx',
      notes: 'Fragile shipment',
    });
    expect(fullShip.shipments?.length).toBe(1);

    // createShipment validation branches
    await expect(
      BillsService.createShipment(scope, shipBill.id, {
        items: [{ product_name: 'Nonexistent Product', quantity: 1 }],
      })
    ).rejects.toThrow('is not part of this order');

    await expect(
      BillsService.createShipment(scope, shipBill.id, {
        items: [{ product_name: 'Ship Line', quantity: 0 }],
      })
    ).rejects.toThrow('must be a positive integer.');

    await expect(
      BillsService.createShipment(scope, shipBill.id, {
        items: [{ product_name: 'Ship Line', quantity: 100 }],
      })
    ).rejects.toThrow('only 3 ready to ship');

    // Update order_first bill that has both active assignments and shipments
    await BillsService.updateBill(scope, shipBill.id, { discount: 5 });

    // Ship remaining ready items to make fully shipped (exercises existing shipments loop in createShipment)
    const fullyShippedBill = await BillsService.createShipment(scope, shipBill.id, {
      items: [{ product_name: 'Ship Line', quantity: 3 }],
    });
    expect(fullyShippedBill.lines?.[0].ready_to_ship).toBe(0);

    // Bill with no products throws on createShipment
    const noProductBill = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      bill_type: 'kacha',
      workflow: 'order_first',
      invoice_number: 'NO-PROD-01',
      products: [],
      created_at: new Date(),
      updated_at: new Date(),
    });
    await expect(BillsService.createShipment(scope, noProductBill.insertedId.toString(), { ship_all: true })).rejects.toThrow('Bill has no products.');

    // createShipment when finished inventory item was deleted
    const missingFinBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Missing Fin', quantity: 2, rate: 100 }],
    });
    const mAss = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: missingFinBill.id,
      raw_item_id: sRaw.id,
      material_name: 'Missing Fin',
      quantity: 2,
      issue_quantity: 2,
    });
    await WorkersService.addBatch(scope, mAss.id, { quantity: 2 });
    await db.collection('inventory_items').deleteOne({ company_id: scope.companyId, name: 'Missing Fin' });
    await expect(
      BillsService.createShipment(scope, missingFinBill.id, { items: [{ product_name: 'Missing Fin', quantity: 1 }] })
    ).rejects.toThrow('not found in stock');

    // Duplicate product name validation
    await expect(
      BillsService.createBill(scope, 'kacha', {
        products: [
          { name: 'Dupe Item', quantity: 1, rate: 10 },
          { name: 'dupe item', quantity: 2, rate: 20 },
        ],
      })
    ).rejects.toThrow('Duplicate product name');

    // confirmProfit on fullyShippedBill with confirmedAmountOverride
    const confirmedProfit = await BillsService.confirmProfit(scope, shipBill.id, 250);
    expect(confirmedProfit.profit_confirmed_amount).toBe(250);

    // confirmProfit on not fully shipped bill throws
    const uncompletedBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Unfinished Item', quantity: 10, rate: 50 }],
    });
    await expect(BillsService.confirmProfit(scope, uncompletedBill.id)).rejects.toThrow('order must be fully shipped');

    // deleteBill guards for order_first
    const deleteTestBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Delete Line', quantity: 5, rate: 50 }],
    });
    const dAss = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: deleteTestBill.id,
      raw_item_id: sRaw.id,
      material_name: 'Delete Line',
      quantity: 5,
      issue_quantity: 5,
    });
    await expect(BillsService.deleteBill(scope, deleteTestBill.id)).rejects.toThrow('non-cancelled worker assignments or shipments exist');
    await WorkersService.cancelAssignment(scope, dAss.id);
    await BillsService.deleteBill(scope, deleteTestBill.id);

    // getBillAssignments
    await expect(BillsService.getBillAssignments(scope, 'invalid-oid')).rejects.toThrow('Invalid bill id.');
    await expect(BillsService.getBillAssignments(scope, new ObjectId().toString())).rejects.toThrow('Bill not found.');
    const assList = await BillsService.getBillAssignments(scope, shipBill.id);
    expect(assList.length).toBe(1);

    // Profit preview on legacy bill with cost_price and linked pay records
    const legacyItemWithCost = await InventoryService.createItem(scope, 'finished', {
      name: 'Costed Legacy Item',
      quantity: 10,
      cost_price: 25,
    });
    const legacyBillDoc = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      bill_type: 'kacha',
      workflow: 'legacy',
      invoice_number: 'LEG-COST-01',
      products: [
        { name: 'Costed Legacy Item', quantity: 2, rate: 50, inventory_item_id: legacyItemWithCost.id },
        { name: 'No Cost Legacy Item', quantity: 1, rate: 30, inventory_item_id: new ObjectId().toString() },
      ],
      transportation_costs: [{ amount: 15 }],
      misc_costs: [{ amount: 10 }],
      payments: [{ amount: 100 }],
      worker_assignment_ids: [],
      created_at: new Date(),
      updated_at: new Date(),
    });
    const legacyPreview = await BillsService.getProfitPreview(scope, legacyBillDoc.insertedId.toString());
    expect(legacyPreview.suggested_profit).toBeDefined();

    // Legacy bill stock deltas in updateBill and convertToPakka
    const legItem1 = await InventoryService.createItem(scope, 'finished', { name: 'Leg Item 1', quantity: 20 });
    const legItem2 = await InventoryService.createItem(scope, 'finished', { name: 'Leg Item 2', quantity: 20 });
    const legDoc = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      bill_type: 'kacha',
      workflow: 'legacy',
      invoice_number: 'LEG-DELTA-01',
      products: [
        { name: 'Leg Item 1', quantity: 5, rate: 50, inventory_item_id: legItem1.id },
        { name: 'Leg Item 2', quantity: 5, rate: 50, inventory_item_id: legItem2.id },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    });

    // updateBill with positive delta on Item 2, negative delta on Item 1
    await BillsService.updateBill(scope, legDoc.insertedId.toString(), {
      products: [
        { name: 'Leg Item 1', quantity: 2, rate: 50, inventory_item_id: legItem1.id },
        { name: 'Leg Item 2', quantity: 8, rate: 50, inventory_item_id: legItem2.id },
      ],
    });

    // convertToPakka with positive delta on Item 1, negative delta on Item 2
    const convertedLeg = await BillsService.convertToPakka(scope, legDoc.insertedId.toString(), {
      gst_number: '29ABCDE1234F1Z5',
      products: [
        { name: 'Leg Item 1', quantity: 6, rate: 50, inventory_item_id: legItem1.id },
        { name: 'Leg Item 2', quantity: 4, rate: 50, inventory_item_id: legItem2.id },
      ],
    });
    expect(convertedLeg.bill_type).toBe('pakka');
  });

  it('WorkersService depth branches: decimal stock messages, missing raw_item_id, updatePayment nulls', async () => {
    const worker = await WorkersService.createWorker(scope, { name: 'Depth Worker' });
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Decimal Silk',
      quantity: 1.25,
      unit: 'm',
    });
    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Silk Ribbon', quantity: 10, rate: 100 }],
    });

    // 1. Decimal formatting in createMaterial error
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'Silk Ribbon',
        quantity: 2,
        issue_quantity: 2.75, // exceeds 1.25
      })
    ).rejects.toThrow(/requested 2.75 m, only 1.25 m in stock/);

    // 2. Decimal formatting in issueRawMaterial error
    const a1 = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Silk Ribbon',
      quantity: 1,
      issue_quantity: 1,
    });
    // raw available is now 0.25
    await expect(
      WorkersService.issueRawMaterial(scope, a1.id, { quantity: 1.5 })
    ).rejects.toThrow(/requested 1.5 m, only 0.25 m in stock/);

    // 3. issueRawMaterial with missing assignment.raw_item_id
    const rawless = await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Silk Ribbon',
      quantity: 5,
      worker_id: worker.id,
      assignment_date: new Date(),
    });
    await expect(
      WorkersService.issueRawMaterial(scope, rawless.insertedId.toString(), { quantity: 1 })
    ).rejects.toThrow('Assignment has no linked raw material item.');

    // 4. issueRawMaterial with missing raw item in inventory
    await db.collection('material_assignments').updateOne(
      { _id: rawless.insertedId },
      { $set: { raw_item_id: new ObjectId().toString() } }
    );
    await expect(
      WorkersService.issueRawMaterial(scope, rawless.insertedId.toString(), { quantity: 1 })
    ).rejects.toThrow('Linked raw inventory item not found.');

    // 5. issueRawMaterial catch block rollback
    vi.spyOn(WorkersRepository, 'addRawIssue').mockRejectedValueOnce(new Error('Simulated issue fail'));
    await expect(
      WorkersService.issueRawMaterial(scope, a1.id, { quantity: 0.1 })
    ).rejects.toThrow('Simulated issue fail');
    vi.restoreAllMocks();

    // 6. cancelAssignment validation branches: invalid id, not found, produced > 0
    await expect(WorkersService.cancelAssignment(scope, 'invalid-oid')).rejects.toThrow('Invalid material assignment id.');
    await expect(WorkersService.cancelAssignment(scope, new ObjectId().toString())).rejects.toThrow('Material assignment not found.');

    const prodAss = await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Silk Ribbon',
      quantity: 5,
      produced_quantity: 3,
      batches: [],
      worker_id: worker.id,
      assignment_date: new Date(),
    });
    await expect(
      WorkersService.cancelAssignment(scope, prodAss.insertedId.toString())
    ).rejects.toThrow('Cannot cancel assignment: production has already been recorded.');

    const batchAss = await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Silk Ribbon',
      quantity: 5,
      produced_quantity: 0,
      batches: [{ batch_id: 'b1', quantity: 1, date: new Date() }],
      worker_id: worker.id,
      assignment_date: new Date(),
    });
    await expect(
      WorkersService.cancelAssignment(scope, batchAss.insertedId.toString())
    ).rejects.toThrow('Cannot cancel assignment: production has already been recorded.');

    // 7. completeAssignment with finished_item_id set and batch sync failure log
    const finItem = await InventoryService.createItem(scope, 'finished', {
      name: 'Finished Ribbon',
    });
    const completeAss = await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Finished Ribbon',
      quantity: 2,
      raw_item_id: raw.id,
      finished_item_id: finItem.id,
      raw_issued_quantity: 2,
      batches: [{ batch_id: 'b-catchup', quantity: 1, synced_to_inventory: false, date: new Date() }],
      worker_id: worker.id,
      assignment_date: new Date(),
    });

    // Make adjustStockById throw to trigger batchSyncErr catch block (unclaims batch and rethrows)
    vi.spyOn(InventoryRepository, 'adjustStockById').mockRejectedValueOnce(new Error('Simulated catchup fail'));
    await expect(
      WorkersService.completeAssignment(scope, completeAss.insertedId.toString())
    ).rejects.toThrow('Simulated catchup fail');
    vi.restoreAllMocks();

    // 8. updatePayment null branches in recordPartialPayment & markPaymentPaid
    const pay = await WorkersService.createPayment(scope, worker.id, {
      product_name: 'Pay Item',
      units_produced: 1,
      rate_per_unit: 10,
    });
    vi.spyOn(WorkersRepository, 'updatePayment').mockResolvedValueOnce(null);
    await expect(WorkersService.recordPartialPayment(scope, pay.id, 5)).rejects.toThrow('Payment record not found.');

    vi.spyOn(WorkersRepository, 'updatePayment').mockResolvedValueOnce(null);
    await expect(WorkersService.markPaymentPaid(scope, pay.id)).rejects.toThrow('Payment record not found.');
    vi.restoreAllMocks();
  });

  it('WorkersService: covers remaining branches in updateWorker, serializeAssignment, completeAssignment, addRawIssue, addBatch, cancelAssignment, and payments', async () => {
    const w = await WorkersService.createWorker(scope, { name: 'Update Coverage Worker' });
    
    // updateWorker branches
    await WorkersService.updateWorker(scope, w.id, {
      name: '  Trimmed Name  ',
      age: null,
      address: '  123 Main St  ',
      phone: '  999-0000  ',
    });
    await WorkersService.updateWorker(scope, w.id, {
      age: ' 42 ',
    });
    await WorkersService.updateWorker(scope, w.id, {
      age: '',
    });

    // serializeAssignment fallbacks
    const svc = WorkersService as any;
    const serializedFallback = svc.serializeAssignment({
      _id: new ObjectId(),
      company_id: scope.companyId,
      material_name: 'Fallback Ass',
      status: null,
      worker_id: null,
      worker: null,
      raw_issues: [{ quantity: 'not-a-number' }],
      batches: [{ quantity: null }],
    });
    expect(serializedFallback.status).toBe('open');
    expect(serializedFallback.worker_id).toBeNull();

    const serializedPaymentFallback = svc.serializePayment({
      _id: new ObjectId(),
      company_id: scope.companyId,
      product_name: 'Fallback Pay',
      units_produced: null,
      rate_per_unit: null,
      amount_paid: null,
      worker_id: null,
      worker: null,
    });
    expect(serializedPaymentFallback.units_produced).toBe(0);
    expect(serializedPaymentFallback.rate_per_unit).toBe(0);
    expect(serializedPaymentFallback.worker_id).toBeNull();

    // createMaterial with custom unit and date
    const rawUnitItem = await InventoryService.createItem(scope, 'raw', {
      name: 'Custom Unit Raw',
      unit: 'meters',
      quantity: 50,
    });
    const billCustom = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Custom Line', quantity: 5, rate: 50, unit: 'rolls' }],
    });
    const createdWithDate = await WorkersService.createMaterial(scope, w.id, {
      bill_id: billCustom.id,
      raw_item_id: rawUnitItem.id,
      material_name: 'Custom Line',
      quantity: 2,
      raw_per_unit: 2,
      issue_quantity: 4,
      date: '2026-03-01T10:00:00Z',
    });
    expect(createdWithDate.unit).toBe('rolls');
    expect(createdWithDate.raw_unit).toBe('meters');

    // Insufficient stock in createMaterial formatted with custom unit
    await expect(
      WorkersService.createMaterial(scope, w.id, {
        bill_id: billCustom.id,
        raw_item_id: rawUnitItem.id,
        material_name: 'Custom Line',
        quantity: 1,
        raw_per_unit: 100,
        issue_quantity: 100,
      })
    ).rejects.toThrow('meters');

    // Insufficient stock in issueRawMaterial formatted with custom unit
    await expect(
      WorkersService.issueRawMaterial(scope, createdWithDate.id, {
        quantity: 1000,
      })
    ).rejects.toThrow('meters');

    // Multi-line bill line loop branch test
    const multiBill = await BillsService.createBill(scope, 'kacha', {
      products: [
        { name: 'Multi Line 1', quantity: 10, rate: 100 },
        { name: 'Multi Line 2', quantity: 10, rate: 200 },
      ],
    });
    const multiRaw = await InventoryService.createItem(scope, 'raw', {
      name: 'Multi Raw Items',
      quantity: 100,
    });
    await WorkersService.createMaterial(scope, w.id, {
      bill_id: multiBill.id,
      raw_item_id: multiRaw.id,
      material_name: 'Multi Line 1',
      quantity: 2,
      raw_per_unit: 1,
      issue_quantity: 2,
    });
    const ass2 = await WorkersService.createMaterial(scope, w.id, {
      bill_id: multiBill.id,
      raw_item_id: multiRaw.id,
      material_name: 'Multi Line 2',
      quantity: 3,
      raw_per_unit: 1,
      issue_quantity: 3,
    });
    expect(ass2.material_name).toBe('Multi Line 2');

    // Legacy assignment without bill_id and without raw_item_name
    const legacyAssDoc = await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Legacy Assignment',
      quantity: 10,
      raw_item_id: rawUnitItem.id,
      raw_issued_quantity: 0,
      assignment_date: new Date(),
      worker_id: w.id,
    });

    // addRawIssue on legacy assignment
    await WorkersService.issueRawMaterial(scope, legacyAssDoc.insertedId.toString(), {
      quantity: 2,
      notes: 'Legacy issue',
    });

    // addBatch with invalid date string vs valid date string
    await WorkersService.addBatch(scope, legacyAssDoc.insertedId.toString(), {
      quantity: 1,
      date: 'not-a-valid-date',
    });
    await WorkersService.addBatch(scope, legacyAssDoc.insertedId.toString(), {
      quantity: 1,
      date: '2026-03-05',
    });

    // completeAssignment on assignment with unsynced batches where finished item does NOT exist yet (triggers createItem)
    const assForComplete = await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Brand New Item For Sync',
      quantity: 2,
      raw_item_id: rawUnitItem.id,
      raw_issued_quantity: 2,
      batches: [{ batch_id: 'b-new', quantity: 2, synced_to_inventory: false, date: null, notes: null }],
      worker_id: w.id,
      assignment_date: new Date(),
    });
    await WorkersService.completeAssignment(scope, assForComplete.insertedId.toString(), {
      returned_quantity: 0,
    });

    // cancelAssignment on assignment without bill_id and without raw_item_name
    const assForCancel = await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Cancel Me',
      quantity: 1,
      raw_item_id: rawUnitItem.id,
      raw_issued_quantity: 1,
      produced_quantity: 0,
      batches: [],
      worker_id: w.id,
      assignment_date: new Date(),
    });
    await WorkersService.cancelAssignment(scope, assForCancel.insertedId.toString(), {
      notes: 'Cancel legacy without bill_id',
    });

    // cancelAssignment with null/undefined batches and raw_issued_quantity
    const minimalAssForCancel = await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      material_name: 'Minimal Cancel',
      quantity: 1,
      worker_id: w.id,
      assignment_date: new Date(),
    });
    await WorkersService.cancelAssignment(scope, minimalAssForCancel.insertedId.toString());

    // recordPayment with whitespace
    const payRec = await WorkersService.createPayment(scope, w.id, {
      product_name: '  Padded Name  ',
      units_produced: 2,
      rate_per_unit: 10,
    });
    expect(payRec.product_name).toBe('Padded Name');
    const partialPay = await WorkersService.recordPartialPayment(scope, payRec.id, 5);
    expect(partialPay.amount_paid).toBe(5);
    const fullyPaid = await WorkersService.markPaymentPaid(scope, payRec.id);
    expect(fullyPaid.paid).toBe(true);
  });

  it('BillsService: covers order_first updateBill line guards, shipment rollback, and recordPayment validation', async () => {
    // 1. updateBill guards for order_first:
    const rawWood = await InventoryService.createItem(scope, 'raw', {
      name: 'Guard Wood',
      quantity: 100,
    });
    const orderBill = await BillsService.createBill(scope, 'kacha', {
      products: [
        { name: 'Guard Chair', quantity: 10, rate: 50 },
        { name: 'Guard Table', quantity: 5, rate: 100 },
      ],
    });
    const w = await WorkersService.createWorker(scope, { name: 'Guard Worker' });
    await WorkersService.createMaterial(scope, w.id, {
      bill_id: orderBill.id,
      raw_item_id: rawWood.id,
      material_name: 'Guard Chair',
      quantity: 6,
    });

    // Guard: Cannot remove product line that has active assignments
    await expect(
      BillsService.updateBill(scope, orderBill.id, {
        products: [{ name: 'Guard Table', quantity: 5, rate: 100 }],
      })
    ).rejects.toThrow('Cannot remove or rename product "Guard Chair"');

    // Guard: Cannot lower quantity below targeted
    await expect(
      BillsService.updateBill(scope, orderBill.id, {
        products: [
          { name: 'Guard Chair', quantity: 4, rate: 50 },
          { name: 'Guard Table', quantity: 5, rate: 100 },
        ],
      })
    ).rejects.toThrow('Cannot lower quantity for product "Guard Chair" below 6');

    // Pakka bill with buyer GST number update
    const pakkaBill = await BillsService.createBill(scope, 'pakka', {
      buyer: { name: 'Pakka Corp', gst_number: '29ABCDE1234F1Z5' },
      products: [{ name: 'Pakka Item', quantity: 2, rate: 50 }],
      gst_percentage: 18,
    });
    const updatedPakka = await BillsService.updateBill(scope, pakkaBill.id, {
      buyer_name: 'Pakka Corp Updated',
      buyer_phone: '9999999999',
      buyer_address: 'Main St',
      gst_number: '29ABCDE1234F2Z6',
    });
    expect(updatedPakka.buyer.name).toBe('Pakka Corp Updated');

    // 2. recordPayment: invalid amount, custom date vs default date
    await expect(
      BillsService.recordPayment(scope, orderBill.id, { amount: -50 })
    ).rejects.toThrow('Payment amount must be positive.');
    await BillsService.recordPayment(scope, orderBill.id, {
      amount: 100,
      date: '2026-03-01T10:00:00.000Z',
      notes: 'advance',
    });
    await BillsService.recordPayment(scope, orderBill.id, {
      amount: 50,
      // no date, no notes
    });

    // 3. calculateProductionProgress when shipments is empty and shipment_confirmed is true
    await db.collection('bills').updateOne(
      { _id: new ObjectId(orderBill.id), company_id: scope.companyId },
      { $set: { shipment_confirmed: true } }
    );
    const progress = await BillsService.getBill(scope, orderBill.id);
    expect(progress.shipment_confirmed).toBe(true);

    // 4. createShipment multi-item rollback:
    // Create finished items for Guard Chair and Guard Table
    const chairItem = await InventoryService.createItem(scope, 'finished', {
      name: 'Guard Chair',
      quantity: 5,
    });
    const tableItem = await InventoryService.createItem(scope, 'finished', {
      name: 'Guard Table',
      quantity: 0, // insufficient!
    });
    // Add production batches so that ready_to_ship > 0
    await db.collection('material_assignments').updateOne(
      { bill_id: orderBill.id, company_id: scope.companyId },
      { $set: { produced_quantity: 6, finished_item_id: chairItem.id } }
    );
    // Also create assignment for Guard Table so ready_to_ship allows shipping
    await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      status: 'open',
      bill_id: orderBill.id,
      material_name: 'Guard Table',
      quantity: 5,
      produced_quantity: 3,
      finished_item_id: tableItem.id,
      worker_id: w.id,
    });

    // Try to ship both chair (qty 2) and table (qty 2).
    // Chair succeeds, table fails (stock 0 < 2).
    // Rollback must restore chair stock to 5 and delete the created movement!
    await expect(
      BillsService.createShipment(scope, orderBill.id, {
        items: [
          { product_name: 'Guard Chair', quantity: 2 },
          { product_name: 'Guard Table', quantity: 2 },
        ],
      })
    ).rejects.toThrow(/Insufficient finished stock/);

    const reloadedChair = await db.collection('inventory_items').findOne({ _id: new ObjectId(chairItem.id) });
    expect(reloadedChair?.quantity).toBe(5);

    // 5. getProfitPreview on legacy bill with payments, transportation_costs, misc_costs, and linkedPayRecords
    const legacyBill = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      bill_type: 'kacha',
      workflow: 'standard',
      products: [{ name: 'Legacy Widget', quantity: 4, rate: 100 }],
      grand_total: 400,
      transportation_costs: [{ amount: 20 }],
      misc_costs: [{ amount: 15 }],
      payments: [{ amount: 200 }],
      worker_assignment_ids: [],
      created_at: new Date(),
    });
    const preview = await BillsService.getProfitPreview(scope, legacyBill.insertedId.toString());
    expect(preview.cost_breakdown.material_cost).toBe(0);
    expect(preview.cost_breakdown.transportation_cost).toBe(20);
    expect(preview.cost_breakdown.misc_cost).toBe(15);
    expect(preview.revenue_collected).toBe(200);

    // 6. createShipment validation branches
    const emptyBill = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      invoice_number: `INV-EMPTY-${Date.now()}`,
      bill_type: 'kacha',
      products: [],
    });
    await expect(
      BillsService.createShipment(scope, emptyBill.insertedId.toString(), { ship_all: true })
    ).rejects.toThrow('Bill has no products.');

    const noShipBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'No Ship Item', quantity: 5, rate: 100 }],
    });
    await expect(
      BillsService.createShipment(scope, noShipBill.id, { ship_all: true })
    ).rejects.toThrow('No products are ready to ship.');

    await expect(
      BillsService.createShipment(scope, noShipBill.id, { items: [] })
    ).rejects.toThrow('No items specified to ship.');

    await expect(
      BillsService.createShipment(scope, noShipBill.id, { items: [{ product_name: 'Ghost Item', quantity: 1 }] })
    ).rejects.toThrow('Product "Ghost Item" is not part of this order.');

    await expect(
      BillsService.createShipment(scope, noShipBill.id, { items: [{ product_name: 'No Ship Item', quantity: -1 }] })
    ).rejects.toThrow('Quantity for "No Ship Item" must be a positive integer.');

    await expect(
      BillsService.createShipment(scope, noShipBill.id, { items: [{ product_name: 'No Ship Item', quantity: 2.5 }] })
    ).rejects.toThrow('Quantity for "No Ship Item" must be a positive integer.');

    await expect(
      BillsService.createShipment(scope, noShipBill.id, { items: [{ product_name: 'No Ship Item', quantity: 1 }] })
    ).rejects.toThrow(/only 0 ready to ship/);

    // 7. getBillAssignments branches
    await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      bill_id: noShipBill.id,
      material_name: 'No Ship Item',
      quantity: 5,
      price_per_unit: 10,
      assignment_date: new Date(),
      batches: [{ batch_id: 'b1', quantity: 6, date: new Date() }],
      wastage_quantity: 1,
      worker: { _id: new ObjectId() },
      status: 'completed',
      completed_at: new Date(),
      wage_amount: 50,
      pay_record_id: 'pr-1',
    });
    const assignmentsResult = await BillsService.getBillAssignments(scope, noShipBill.id);
    expect(assignmentsResult.length).toBeGreaterThan(0);
    expect(assignmentsResult[0].over_returned).toBe(true);

    // 8. updateBill legacy stock rollback and decimal stock error messages
    const legacyStockItem1 = await InventoryService.createItem(scope, 'finished', {
      name: 'Legacy Fin 1',
      quantity: 10,
    });
    const legacyStockItem2 = await InventoryService.createItem(scope, 'finished', {
      name: 'Legacy Fin 2',
      quantity: 1.5,
    });
    const legacyStockBill = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      invoice_number: `INV-LEGACY-${Date.now()}`,
      bill_type: 'kacha',
      products: [
        { inventory_item_id: legacyStockItem1.id, name: 'Legacy Fin 1', quantity: 2, rate: 50 },
        { inventory_item_id: legacyStockItem2.id, name: 'Legacy Fin 2', quantity: 1, rate: 50 },
      ],
      created_at: new Date(),
    });
    await expect(
      BillsService.updateBill(scope, legacyStockBill.insertedId.toString(), {
        products: [
          { inventory_item_id: legacyStockItem1.id, name: 'Legacy Fin 1', quantity: 7, rate: 50 },
          { inventory_item_id: legacyStockItem2.id, name: 'Legacy Fin 2', quantity: 3.5, rate: 50 },
        ],
      })
    ).rejects.toThrow(/Insufficient stock: Legacy Fin 2: requested 2.5 pcs/);

    // 9. serializeBill with produced_quantity null but batches array present and shipment with items
    const serBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Ser Chair', quantity: 10, rate: 100 }],
    });
    await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      bill_id: serBill.id,
      material_name: 'Ser Chair',
      quantity: 10,
      produced_quantity: null,
      batches: [{ batch_id: 'b-ser', quantity: 4 }],
      status: 'open',
    });
    await db.collection('bills').updateOne(
      { _id: new ObjectId(serBill.id), company_id: scope.companyId },
      {
        $push: {
          shipments: {
            shipment_id: 's-ser',
            date: new Date().toISOString(),
            items: [
              { product_name: 'Ser Chair', quantity: 2 },
              { product_name: 'Other Unmatched Line', quantity: 1 },
            ],
          },
        } as any,
      }
    );
    const loadedSerBill = await BillsService.getBill(scope, serBill.id);
    expect(loadedSerBill.products[0].name).toBe('Ser Chair');

    // 10. validateUniqueProductNames in createBill and empty product name handling
    await expect(
      BillsService.createBill(scope, 'kacha', {
        products: [
          { name: 'Same Line', quantity: 2, rate: 50 },
          { name: '  same line  ', quantity: 3, rate: 50 },
        ],
      })
    ).rejects.toThrow(/Duplicate product name in bill/);

    // 11. listBills with an assignment that has bill_id: null
    await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      bill_id: null,
      material_name: 'Unlinked Material',
      quantity: 5,
      status: 'open',
    });
    const listedBills = await BillsService.listBills(scope);
    expect(listedBills.length).toBeGreaterThan(0);

    // 13. updateBill order_first with existing shipments matching and non-matching lines
    const shipBill = await BillsService.createBill(scope, 'kacha', {
      products: [
        { name: 'Ship Line 1', quantity: 10, rate: 50 },
        { name: 'Ship Line 2', quantity: 10, rate: 50 },
      ],
    });
    await db.collection('bills').updateOne(
      { _id: new ObjectId(shipBill.id), company_id: scope.companyId },
      {
        $push: {
          shipments: {
            shipment_id: 's-ship',
            date: new Date().toISOString(),
            items: [
              { product_name: 'Ship Line 1', quantity: 5 },
              { product_name: 'Unrelated Line', quantity: 2 },
            ],
          },
        } as any,
      }
    );
    // Lowering below shipped (5) must throw
    await expect(
      BillsService.updateBill(scope, shipBill.id, {
        products: [
          { name: 'Ship Line 1', quantity: 3, rate: 50 },
          { name: 'Ship Line 2', quantity: 10, rate: 50 },
        ],
      })
    ).rejects.toThrow('Cannot lower quantity for product "Ship Line 1" below 5');

    // 14. getProfitPreview: order_first with price_per_unit = 0 (cost_known: false) and completed assignment
    const zeroCostRawBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Zero Cost Product', quantity: 5, rate: 100 }],
    });
    await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      bill_id: zeroCostRawBill.id,
      material_name: 'Zero Cost Product',
      raw_item_name: '', // empty name -> falls back to 'Raw'
      raw_issued_quantity: 5,
      raw_returned_quantity: 0,
      price_per_unit: 0, // cost_known: false
      wage_amount: 80,
      status: 'completed',
    });
    const zeroCostPreview = await BillsService.getProfitPreview(scope, zeroCostRawBill.id);
    expect(zeroCostPreview.lines[0].cost_known).toBe(false);
    expect(zeroCostPreview.cost_breakdown.worker_cost).toBe(80);

    // 15. getProfitPreview: legacy bill with inventory_item_id cost price and linked pay records
    const legFinItem = await InventoryService.createItem(scope, 'finished', {
      name: 'Legacy Fin Known',
      quantity: 10,
      cost_price: 25,
    });
    const legacyKnownBill = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      invoice_number: `INV-LEG-KNOWN-${Date.now()}`,
      bill_type: 'kacha',
      workflow: 'standard',
      products: [{ inventory_item_id: legFinItem.id, name: 'Legacy Fin Known', quantity: 2, rate: 100 }],
      grand_total: 200,
      created_at: new Date(),
    });
    const legBillIdStr = legacyKnownBill.insertedId.toString();
    await db.collection('pay_records').insertOne({
      company_id: scope.companyId,
      bill_id: legBillIdStr,
      units_produced: 4,
      rate_per_unit: 15,
    });
    const legacyKnownPreview = await BillsService.getProfitPreview(scope, legBillIdStr);
    expect(legacyKnownPreview.cost_breakdown.material_cost).toBe(50);
    expect(legacyKnownPreview.cost_breakdown.worker_cost).toBe(60);

    // 16. updateBill legacy with negative net deltas rolled back on failure (lines 649-651)
    const legItemA = await InventoryService.createItem(scope, 'finished', {
      name: 'Rollback Fin A',
      quantity: 10,
    });
    const legItemB = await InventoryService.createItem(scope, 'finished', {
      name: 'Rollback Fin B',
      quantity: 0,
    });
    const rollbackBill = await db.collection('bills').insertOne({
      company_id: scope.companyId,
      invoice_number: `INV-ROLL-${Date.now()}`,
      bill_type: 'kacha',
      workflow: 'standard',
      products: [
        { inventory_item_id: legItemA.id, name: 'Rollback Fin A', quantity: 5, rate: 50 },
        { inventory_item_id: legItemB.id, name: 'Rollback Fin B', quantity: 1, rate: 50 },
      ],
      created_at: new Date(),
    });
    // Decrease A from 5 to 2 (negativeNetDelta = 3 restored), but increase B from 1 to 10 (insufficient stock)
    await expect(
      BillsService.updateBill(scope, rollbackBill.insertedId.toString(), {
        products: [
          { inventory_item_id: legItemA.id, name: 'Rollback Fin A', quantity: 2, rate: 50 },
          { inventory_item_id: legItemB.id, name: 'Rollback Fin B', quantity: 10, rate: 50 },
        ],
      })
    ).rejects.toThrow(/Insufficient stock: Rollback Fin B/);

    // 17. convertToPakka retry on duplicate invoice number (lines 803-806)
    const convBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Convert Item', quantity: 2, rate: 100 }],
    });
    let attemptCount = 0;
    const origUpdate = BillsRepository.updateBillRaw.bind(BillsRepository);
    vi.spyOn(BillsRepository, 'updateBillRaw').mockImplementation(async (s, bId, update) => {
      if (attemptCount === 0) {
        attemptCount++;
        const dupErr = new Error('E11000 duplicate key error');
        (dupErr as any).code = 11000;
        throw dupErr;
      }
      return origUpdate(s, bId, update);
    });
    const converted = await BillsService.convertToPakka(scope, convBill.id, {
      gst_number: '29ABCDE1234F1Z5',
    });
    expect(converted.bill_type).toBe('pakka');
    vi.restoreAllMocks();

    // 18. updateBill with undefined products & discount, and getBill with missing names
    const updBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Upd Line', quantity: 5, rate: 50 }],
      discount: 5,
    });
    // products undefined, discount defined
    const updRes1 = await BillsService.updateBill(scope, updBill.id, { discount: 10 });
    expect(updRes1.discount).toBe(10);
    // products undefined, discount undefined (fallback to existing.discount)
    const updRes2 = await BillsService.updateBill(scope, updBill.id, {});
    expect(updRes2.discount).toBe(10);

    // pakka update with gst_percentage undefined (fallback to existing.gst_percentage)
    const pakkaUpd = await BillsService.createBill(scope, 'pakka', {
      buyer: { name: 'P Corp', gst_number: '29ABCDE1234F1Z5' },
      products: [{ name: 'P Line', quantity: 2, rate: 100 }],
      gst_percentage: 12,
    });
    const pakkaRes = await BillsService.updateBill(scope, pakkaUpd.id, {});
    expect(pakkaRes.gst_percentage).toBe(12);

    // getBill with product having undefined name and assignment having undefined material_name
    await db.collection('bills').updateOne(
      { _id: new ObjectId(updBill.id), company_id: scope.companyId },
      { $set: { products: [{ quantity: 2, rate: 20 }] } }
    );
    await db.collection('material_assignments').insertOne({
      company_id: scope.companyId,
      bill_id: updBill.id,
      quantity: 1,
      status: 'open',
    });
    const undefNameBill = await BillsService.getBill(scope, updBill.id);
    expect(undefNameBill.lines[0].name).toBeUndefined();
  });
});
