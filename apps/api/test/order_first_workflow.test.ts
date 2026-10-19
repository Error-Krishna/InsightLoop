import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo, getDb } from '../src/db/mongo.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('Order-First Production Workflow (Raw -> In Progress -> Finished -> Shipped)', () => {
  const scope: TenantScope = { companyId: 'test-order-first-' + Date.now() };
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

  it('R1 & R2: Bill creation does not touch inventory, stores null inventory_item_id, and rejects duplicate line names', async () => {
    // 1. Create raw item and existing finished item
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Organic Cotton Fabric',
      quantity: 500,
      unit: 'm',
      cost_price: 60,
    });
    const finished = await InventoryService.createItem(scope, 'finished', {
      name: 'Summer Linen Shirt',
      unit: 'pcs',
      selling_price: 500,
    });
    expect(finished.quantity).toBe(0);

    // 2. Duplicate product name inside bill (case-insensitive & trimmed) -> 400
    await expect(
      BillsService.createBill(scope, 'kacha', {
        products: [
          { name: 'Summer Linen Shirt', quantity: 10, rate: 500 },
          { name: '  summer linen shirt  ', quantity: 5, rate: 500 },
        ],
      })
    ).rejects.toThrow('Duplicate product name in bill: "summer linen shirt".');

    // 3. Bill creation does not touch inventory, inventory_item_id stored as null
    const bill = await BillsService.createBill(scope, 'kacha', {
      buyer: { name: 'Metro Retailers', phone: '9876543210' },
      products: [
        { name: 'Summer Linen Shirt', quantity: 20, rate: 500, unit: 'pcs', inventory_item_id: finished.id },
        { name: 'Casual Denim Trouser', quantity: 10, rate: 800, unit: 'pcs' },
      ],
      discount: 200,
    });

    expect(bill.workflow).toBe('order_first');
    expect(bill.products[0].inventory_item_id).toBeNull();
    expect(bill.lines[0].ordered).toBe(20);
    expect(bill.lines[0].targeted).toBe(0);
    expect(bill.lines[0].produced).toBe(0);
    expect(bill.lines[0].shipped).toBe(0);
    expect(bill.lines[0].ready_to_ship).toBe(0);
    expect(bill.order_status).toBe('confirmed');

    // Raw and finished quantities untouched
    const checkRaw = await InventoryRepository.findItemById(scope, raw.id);
    expect(checkRaw?.quantity).toBe(500);
    const checkFinished = await InventoryRepository.findItemById(scope, finished.id);
    expect(checkFinished?.quantity).toBe(0);

    // 4. Update bill duplicate product name -> 400
    await expect(
      BillsService.updateBill(scope, bill.id, {
        products: [
          { name: 'Summer Linen Shirt', quantity: 20, rate: 500 },
          { name: 'summer linen shirt', quantity: 5, rate: 500 },
        ],
      })
    ).rejects.toThrow('Duplicate product name in bill: "summer linen shirt".');
  });

  it('R3: Assignment creation validates targets, active worker, and atomically deducts raw stock with ledger', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Yarn Spool Raw',
      quantity: 50,
      unit: 'kg',
      cost_price: 120,
    });

    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Woolen Sweater', quantity: 30, rate: 600, unit: 'pcs' }],
    });

    const worker = await WorkersService.createWorker(scope, {
      name: 'Anil Master',
      phone: '9900112233',
    });

    // Worker must be active
    await WorkersService.updateWorker(scope, worker.id, { is_active: false });
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'Woolen Sweater',
        quantity: 10,
        price_per_unit: 120,
      })
    ).rejects.toThrow('Worker is inactive.');

    await WorkersService.updateWorker(scope, worker.id, { is_active: true });

    // Product must match a bill line
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'Non Existent Cap',
        quantity: 10,
        price_per_unit: 120,
      })
    ).rejects.toThrow('Product "Non Existent Cap" does not match any line in the specified bill.');

    // Quantity cannot exceed ordered quantity
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'Woolen Sweater',
        quantity: 35, // ordered is 30
        price_per_unit: 120,
      })
    ).rejects.toThrow('Quantity (35) exceeds remaining unassigned quantity (30) for product "Woolen Sweater".');

    // Insufficient raw stock: requested 60 kg (20 sweaters * 3 kg/sweater), but stock is only 50 kg
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'Woolen Sweater',
        quantity: 20,
        raw_per_unit: 3,
        wage_amount: 500,
      })
    ).rejects.toThrow('Insufficient raw stock: Yarn Spool Raw: requested 60.0 kg, only 50.0 kg in stock');

    // Nothing was created and raw stock untouched
    const rawCheckBefore = await InventoryRepository.findItemById(scope, raw.id);
    expect(rawCheckBefore?.quantity).toBe(50);

    // Successful assignment with issue_quantity default (15 sweaters * 2 kg = 30 kg issued)
    const assignment1 = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Woolen Sweater',
      quantity: 15,
      raw_per_unit: 2,
      wage_amount: 300,
      notes: 'First batch of sweaters',
    });

    expect(assignment1.raw_issued_quantity).toBe(30);
    expect(assignment1.status).toBe('open');
    expect(assignment1.raw_issues?.length).toBe(1);

    // Verify raw stock deducted 50 - 30 = 20
    const rawCheckAfter = await InventoryRepository.findItemById(scope, raw.id);
    expect(rawCheckAfter?.quantity).toBe(20);

    // Verify stock_movements ledger wrote raw_issue
    const movements = await db.collection('stock_movements').find({
      company_id: scope.companyId,
      bill_id: bill.id,
      type: 'raw_issue',
    }).toArray();
    expect(movements.length).toBe(1);
    expect(movements[0].quantity).toBe(30);
    expect(movements[0].item_id).toBe(raw.id);

    // Bill progress updated: targeted: 15, ordered: 30
    const billProgress = await BillsService.getBill(scope, bill.id);
    expect(billProgress.lines[0].targeted).toBe(15);
    expect(billProgress.order_status).toBe('in_production');

    // Second assignment with issue_quantity: 0 (issue later)
    const assignment2 = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Woolen Sweater',
      quantity: 15, // fills remaining 15
      raw_per_unit: 1,
      issue_quantity: 0,
      wage_amount: 200,
    });
    expect(assignment2.raw_issued_quantity).toBe(0);
    expect(assignment2.raw_issues?.length).toBe(0);

    // Trying to create a third assignment exceeds total ordered (30 targeted out of 30 ordered)
    await expect(
      WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: raw.id,
        material_name: 'Woolen Sweater',
        quantity: 1,
      })
    ).rejects.toThrow('Quantity (1) exceeds remaining unassigned quantity (0) for product "Woolen Sweater".');
  });

  it('R4: Issue more raw increases raw_issued_quantity, deducts inventory, and writes to ledger', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Leather Hide Raw',
      quantity: 40,
      unit: 'sqft',
      cost_price: 200,
    });

    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Leather Boots', quantity: 10, rate: 1200 }],
    });

    const worker = await WorkersService.createWorker(scope, { name: 'Kavita Worker' });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Leather Boots',
      quantity: 10,
      raw_per_unit: 2,
      issue_quantity: 10, // issued only 10 upfront
    });

    // Check stock after initial issue: 40 - 10 = 30
    let checkRaw = await InventoryRepository.findItemById(scope, raw.id);
    expect(checkRaw?.quantity).toBe(30);

    // Issue more raw: attempt exceeding stock
    await expect(
      WorkersService.issueRawMaterial(scope, assignment.id, { quantity: 35 })
    ).rejects.toThrow('Insufficient raw stock: Leather Hide Raw: requested 35.0 sqft, only 30.0 sqft in stock');

    // Issue valid amount: 15 sqft
    const updated = await WorkersService.issueRawMaterial(scope, assignment.id, {
      quantity: 15,
      notes: 'Additional leather for lining',
    });
    expect(updated.raw_issued_quantity).toBe(25);
    expect(updated.raw_issues?.length).toBe(2);

    checkRaw = await InventoryRepository.findItemById(scope, raw.id);
    expect(checkRaw?.quantity).toBe(15);

    // Verify ledger
    const issues = await db.collection('stock_movements').find({
      company_id: scope.companyId,
      assignment_id: assignment.id,
      type: 'raw_issue',
    }).sort({ created_at: 1 }).toArray();
    expect(issues.length).toBe(2);
    expect(issues[0].quantity).toBe(10);
    expect(issues[1].quantity).toBe(15);
  });

  it('R5: Output chunks (batches) create finished inventory, sync batches, cap output, and record ledger', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Metal Sheet Raw',
      quantity: 100,
      unit: 'kg',
      cost_price: 50,
    });

    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Steel Toolbox', quantity: 20, rate: 350, unit: 'pcs' }],
    });

    const worker = await WorkersService.createWorker(scope, { name: 'Ramesh Welder' });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Steel Toolbox',
      quantity: 20,
      raw_per_unit: 2,
      wage_amount: 400,
    });

    // 1. Output cannot exceed targeted quantity (target is 20)
    await expect(
      WorkersService.addBatch(scope, assignment.id, { quantity: 25 })
    ).rejects.toThrow('Output can never exceed the order, that would create stock without an order. Remaining target: 20, requested: 25.');

    // 2. Add first batch: 8 toolboxes
    const batchRes1 = await WorkersService.addBatch(scope, assignment.id, {
      quantity: 8,
      notes: 'First batch of 8 finished',
    });
    expect(batchRes1.delivered_quantity).toBe(8);
    expect(batchRes1.balance_quantity).toBe(12);
    expect(batchRes1.batches[0].synced_to_inventory).toBe(true);

    // Finished item was auto-created in finished inventory with rate 350 and cost 0
    const finishedItem = await InventoryRepository.findItemByNameAndType(scope, 'Steel Toolbox', 'finished');
    expect(finishedItem).toBeDefined();
    expect(finishedItem?.quantity).toBe(8);
    expect(finishedItem?.selling_price).toBe(350);
    expect(finishedItem?.cost_price).toBe(0);

    // Ledger production_in logged
    const prodMovements = await db.collection('stock_movements').find({
      company_id: scope.companyId,
      assignment_id: assignment.id,
      type: 'production_in',
    }).toArray();
    expect(prodMovements.length).toBe(1);
    expect(prodMovements[0].quantity).toBe(8);

    // 3. Second batch: 12 toolboxes (reaches target 20)
    const batchRes2 = await WorkersService.addBatch(scope, assignment.id, {
      quantity: 12,
    });
    expect(batchRes2.delivered_quantity).toBe(20);
    expect(batchRes2.balance_quantity).toBe(0);

    // Finished inventory increased to 20
    const finishedItem2 = await InventoryRepository.findItemById(scope, finishedItem!._id.toString());
    expect(finishedItem2?.quantity).toBe(20);

    // 4. Exceeding remaining target (remaining is 0) throws 400
    await expect(
      WorkersService.addBatch(scope, assignment.id, { quantity: 1 })
    ).rejects.toThrow('Output can never exceed the order, that would create stock without an order. Remaining target: 0, requested: 1.');
  });

  it('R6 & R13: Complete assignment returns unused raw, computes wastage, creates wage pay record, and records profit material cost', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Denim Cloth Raw',
      quantity: 80,
      unit: 'm',
      cost_price: 150,
    });

    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Denim Jacket', quantity: 10, rate: 1000, unit: 'pcs' }],
    });

    const worker = await WorkersService.createWorker(scope, { name: 'Kiran Stitcher' });

    // Target 10 jackets, raw_per_unit = 5m (planned 50m). Issued 55m.
    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Denim Jacket',
      quantity: 10,
      raw_per_unit: 5,
      issue_quantity: 55,
      wage_amount: 800,
    });

    // Worker produces 8 jackets (short run)
    await WorkersService.addBatch(scope, assignment.id, { quantity: 8 });

    // Complete assignment returning 3m of raw
    // Wastage calculation:
    // net raw used = issued (55) - returned (3) = 52
    // theoretical raw needed = produced (8) * raw_per_unit (5) = 40
    // wastage = max(0, 52 - 40) = 12
    const completed = await WorkersService.completeAssignment(scope, assignment.id, {
      raw_returned_quantity: 3,
    });
    expect(completed.status).toBe('completed');
    expect(completed.raw_returned_quantity).toBe(3);
    expect(completed.wastage_quantity).toBe(12);
    expect(completed.completed_at).toBeDefined();

    // Raw returned back to stock: 80 - 55 + 3 = 28
    const rawCheck = await InventoryRepository.findItemById(scope, raw.id);
    expect(rawCheck?.quantity).toBe(28);

    // Ledger logged raw_return
    const returnMovement = await db.collection('stock_movements').findOne({
      company_id: scope.companyId,
      assignment_id: assignment.id,
      type: 'raw_return',
    });
    expect(returnMovement).toBeDefined();
    expect(returnMovement?.quantity).toBe(3);

    // Wage pay record created
    expect(completed.pay_record_id).toBeDefined();
    const payRec = await db.collection('pay_records').findOne({ _id: new ObjectId(completed.pay_record_id!) });
    expect(payRec?.rate_per_unit).toBe(800);

    // Completed assignment is immutable
    await expect(
      WorkersService.addBatch(scope, assignment.id, { quantity: 1 })
    ).rejects.toThrow('Cannot add batch: assignment is not open.');
    await expect(
      WorkersService.completeAssignment(scope, assignment.id)
    ).rejects.toThrow('This assignment is already marked complete.');

    // R13: Profit preview material & worker cost calculation
    // material cost = net raw used * price_per_unit = (55 - 3) * 150 = 52 * 150 = 7800
    // worker cost = 800
    const profitPreview = await BillsService.getProfitPreview(scope, bill.id);
    expect(profitPreview.cost_breakdown.material_cost).toBe(7800);
    expect(profitPreview.cost_breakdown.worker_cost).toBe(800);
  });

  it('R7: Cancel assignment returns all unreturned raw to stock and logs raw_return', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Woolen Yarn Raw',
      quantity: 100,
      unit: 'kg',
      cost_price: 80,
    });

    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Woolen Shawl', quantity: 10, rate: 400 }],
    });

    const worker = await WorkersService.createWorker(scope, { name: 'Sita Weaver' });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Woolen Shawl',
      quantity: 10,
      issue_quantity: 30,
      wage_amount: 300,
    });

    // Check stock after issue: 100 - 30 = 70
    let checkRaw = await InventoryRepository.findItemById(scope, raw.id);
    expect(checkRaw?.quantity).toBe(70);

    // Cancel assignment
    const cancelled = await WorkersService.cancelAssignment(scope, assignment.id);
    expect(cancelled.status).toBe('cancelled');

    // All raw returned back to stock: 70 + 30 = 100
    checkRaw = await InventoryRepository.findItemById(scope, raw.id);
    expect(checkRaw?.quantity).toBe(100);

    // Stock movement logged raw_return of 30
    const cancelMovement = await db.collection('stock_movements').findOne({
      company_id: scope.companyId,
      assignment_id: assignment.id,
      type: 'raw_return',
    });
    expect(cancelMovement?.quantity).toBe(30);

    // Cannot cancel again
    await expect(
      WorkersService.cancelAssignment(scope, assignment.id)
    ).rejects.toThrow('Only open assignments can be cancelled.');

    // Assignment with production cannot be cancelled
    const raw2 = await InventoryService.createItem(scope, 'raw', {
      name: 'Raw Silk',
      quantity: 50,
      unit: 'kg',
    });
    const assignmentWithProd = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw2.id,
      material_name: 'Woolen Shawl',
      quantity: 5,
      issue_quantity: 10,
    });
    await WorkersService.addBatch(scope, assignmentWithProd.id, { quantity: 2 });
    await expect(
      WorkersService.cancelAssignment(scope, assignmentWithProd.id)
    ).rejects.toThrow('Cannot cancel assignment: production has already been recorded.');
  });

  it('R8, R9, R10: Shipments decrement finished stock conditionally, order_status lifecycle, and profit confirmation', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Cotton Fabric X',
      quantity: 100,
      unit: 'm',
      cost_price: 50,
    });

    const bill = await BillsService.createBill(scope, 'pakka', {
      buyer: { name: 'Fashion Express', gst_number: '07AAAAA0000A1Z5' },
      products: [
        { name: 'Striped Shirt', quantity: 10, rate: 600, unit: 'pcs' },
        { name: 'Plain Pants', quantity: 5, rate: 800, unit: 'pcs' },
      ],
      gst_percentage: 12,
    });

    const worker = await WorkersService.createWorker(scope, { name: 'Vipin Master' });

    // Initial state: confirmed
    let serialized = await BillsService.getBill(scope, bill.id);
    expect(serialized.order_status).toBe('confirmed');

    // Create assignment for Striped Shirt: 10 units
    const a1 = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Striped Shirt',
      quantity: 10,
      raw_per_unit: 2,
      wage_amount: 400,
    });

    // Create assignment for Plain Pants: 5 units
    const a2 = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Plain Pants',
      quantity: 5,
      raw_per_unit: 2,
      wage_amount: 300,
    });

    serialized = await BillsService.getBill(scope, bill.id);
    expect(serialized.order_status).toBe('in_production');

    // Produce all 10 Striped Shirts and 5 Plain Pants
    await WorkersService.addBatch(scope, a1.id, { quantity: 10 });
    await WorkersService.addBatch(scope, a2.id, { quantity: 5 });

    serialized = await BillsService.getBill(scope, bill.id);
    expect(serialized.lines[0].produced).toBe(10);
    expect(serialized.lines[0].ready_to_ship).toBe(10);
    expect(serialized.lines[1].produced).toBe(5);
    expect(serialized.lines[1].ready_to_ship).toBe(5);
    expect(serialized.order_status).toBe('ready_to_ship');

    // Attempting to ship more than available -> 400
    await expect(
      BillsService.createShipment(scope, bill.id, {
        items: [{ product_name: 'Striped Shirt', quantity: 12 }],
      })
    ).rejects.toThrow('Cannot ship 12 of "Striped Shirt": only 10 ready to ship.');

    // Partial shipment: ship 4 Striped Shirts
    const partialShipment = await BillsService.createShipment(scope, bill.id, {
      items: [{ product_name: 'Striped Shirt', quantity: 4 }],
      notes: 'First delivery van',
    });
    expect(partialShipment.order_status).toBe('partially_shipped');
    expect(partialShipment.lines[0].shipped).toBe(4);
    expect(partialShipment.lines[0].ready_to_ship).toBe(6);

    // Verify finished stock decremented: 10 - 4 = 6
    const shirtItem = await InventoryRepository.findItemByNameAndType(scope, 'Striped Shirt', 'finished');
    expect(shirtItem?.quantity).toBe(6);

    // Verify ledger logged shipment_out
    const shipMovement = await db.collection('stock_movements').findOne({
      company_id: scope.companyId,
      bill_id: bill.id,
      type: 'shipment_out',
    });
    expect(shipMovement?.quantity).toBe(4);

    // Profit confirmation blocked before fully shipped (Rule R10)
    await expect(
      BillsService.confirmProfit(scope, bill.id)
    ).rejects.toThrow('Cannot confirm profit: order must be fully shipped before confirming profit.');

    // Ship remainder with ship_all: true
    const fullyShipped = await BillsService.createShipment(scope, bill.id, { ship_all: true });
    expect(fullyShipped.order_status).toBe('shipped');
    expect(fullyShipped.lines[0].shipped).toBe(10);
    expect(fullyShipped.lines[0].ready_to_ship).toBe(0);
    expect(fullyShipped.lines[1].shipped).toBe(5);
    expect(fullyShipped.lines[1].ready_to_ship).toBe(0);

    // Stock for both items now 0
    const shirtItemFinal = await InventoryRepository.findItemById(scope, shirtItem!._id.toString());
    expect(shirtItemFinal?.quantity).toBe(0);
    const pantsItem = await InventoryRepository.findItemByNameAndType(scope, 'Plain Pants', 'finished');
    expect(pantsItem?.quantity).toBe(0);

    // Now profit confirmation is allowed!
    const profitConfirmed = await BillsService.confirmProfit(scope, bill.id);
    expect(profitConfirmed.profit_confirmed).toBe(true);

    // Once fully paid, order_status becomes 'closed'
    const fullPayment = await BillsService.recordPayment(scope, bill.id, {
      amount: fullyShipped.grand_total,
    });
    expect(fullPayment.order_status).toBe('closed');
  });

  it('R11: Finished inventory quantity is read-only; Raw inventory quantity is editable; Live semi-finished is derived', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Polyester Thread',
      quantity: 200,
      unit: 'm',
    });

    const finished = await InventoryService.createItem(scope, 'finished', {
      name: 'Polyester Cap',
      unit: 'pcs',
    });
    expect(finished.quantity).toBe(0);

    // Manual edit of quantity on raw is ALLOWED
    const updatedRaw = await InventoryService.updateItem(scope, 'raw', raw.id, { quantity: 250 });
    expect(updatedRaw.quantity).toBe(250);

    // Manual edit of quantity on finished is REJECTED
    await expect(
      InventoryService.updateItem(scope, 'finished', finished.id, { quantity: 10 })
    ).rejects.toThrow('Finished stock changes only through production and shipments.');

    // Live semi-finished derived from open assignments
    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Polyester Cap', quantity: 15, rate: 100 }],
    });
    const worker = await WorkersService.createWorker(scope, { name: 'Cap Maker' });
    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Polyester Cap',
      quantity: 15,
      issue_quantity: 30,
    });

    const wip = await InventoryService.getLiveSemiFinished(scope);
    const capWip = wip.in_production.find((w) => w.name === 'Polyester Cap');
    expect(capWip).toBeDefined();
    expect(capWip?.balance_quantity).toBe(15);
    expect(capWip?.order?.invoice_number).toBe(bill.invoice_number);

    // Complete assignment removes it from live WIP
    await WorkersService.completeAssignment(scope, assignment.id);
    const wipAfter = await InventoryService.getLiveSemiFinished(scope);
    const capWipAfter = wipAfter.in_production.find((w) => w.name === 'Polyester Cap');
    expect(capWipAfter).toBeUndefined();
  });

  it('R12: Guarding deletes and updates: Cannot delete bill with assignments; Cannot delete worker with open assignments; Cannot reduce bill qty below targeted', async () => {
    const raw = await InventoryService.createItem(scope, 'raw', {
      name: 'Wood Block Raw',
      quantity: 50,
      unit: 'pcs',
    });

    const bill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Wooden Stool', quantity: 10, rate: 250 }],
    });

    const worker = await WorkersService.createWorker(scope, { name: 'Dev Carpenter' });

    const assignment = await WorkersService.createMaterial(scope, worker.id, {
      bill_id: bill.id,
      raw_item_id: raw.id,
      material_name: 'Wooden Stool',
      quantity: 6,
      issue_quantity: 6,
    });

    // 1. Cannot delete worker with open assignments
    await expect(
      WorkersService.deleteWorker(scope, worker.id)
    ).rejects.toThrow('Cannot delete worker: worker has open material assignments.');

    // 2. Cannot delete bill with non-cancelled assignments
    await expect(
      BillsService.deleteBill(scope, bill.id)
    ).rejects.toThrow('Cannot delete order: non-cancelled worker assignments or shipments exist for this order.');

    // 3. Cannot reduce bill line quantity below targeted (targeted is 6)
    await expect(
      BillsService.updateBill(scope, bill.id, {
        products: [{ name: 'Wooden Stool', quantity: 5, rate: 250 }],
      })
    ).rejects.toThrow('Cannot lower quantity for product "Wooden Stool" below 6 (already targeted/shipped).');

    // Cancelling the assignment frees the worker and bill
    await WorkersService.cancelAssignment(scope, assignment.id);

    await BillsService.deleteBill(scope, bill.id);
    const billAfter = await BillsRepository.findBillById(scope, bill.id);
    expect(billAfter).toBeNull();

    await WorkersService.deleteWorker(scope, worker.id);
    const workerAfter = await WorkersRepository.findWorkerById(scope, worker.id);
    expect(workerAfter).toBeNull();
  });
});
