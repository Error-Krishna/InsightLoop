import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo } from '../src/db/mongo.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { ValidationError, NotFoundError } from '../src/utils/errors.js';
import { hashPassword, verifyPassword } from '../src/utils/crypto.js';
import { env } from '../src/config/env.js';

describe('Required Branch Density & Edge Exhaustion Suite', () => {
  const companyId = 'density-test-' + Date.now();
  const scope = { companyId, company_id: companyId };
  let db: any;

  beforeAll(async () => {
    db = await connectMongo();
  });

  afterAll(async () => {
    if (db) {
      await db.collection('company').deleteMany({ company_id: { $regex: /^density-test/ } });
      await db.collection('user').deleteMany({ company_id: { $regex: /^density-test/ } });
      await db.collection('inventory_items').deleteMany({ company_id: companyId });
      await db.collection('warehouses').deleteMany({ company_id: companyId });
      await db.collection('workers').deleteMany({ company_id: companyId });
      await db.collection('bills').deleteMany({ company_id: companyId });
      await db.collection('material_assignments').deleteMany({ company_id: companyId });
      await db.collection('pay_records').deleteMany({ company_id: companyId });
    }
    await closeMongo();
  });

  describe('AuthService Branch Coverage Exhaustion', () => {
    it('covers password hashing options and edge user payloads', async () => {
      // 1. hashPassword and verifyPassword
      const hash = await hashPassword('custom-pass');
      expect(hash).toContain('pbkdf2_sha256$600000$');
      const valid = await verifyPassword('custom-pass', hash);
      expect(valid).toBe(true);

      // 2. Register user without name
      const noNameEmail = `noname_${Date.now()}@density.com`;
      const reg = await AuthService.signup({
        name: 'NoName',
        email: noNameEmail,
        password: 'password123',
        company_name: 'No Name Corp',
      });
      expect(reg.user.name).toBe('NoName');

      // 3. Login user with null name
      await db.collection('user').updateOne({ email: noNameEmail }, { $set: { name: null } });
      const loginRes = await AuthService.login({
        email: noNameEmail,
        password: 'password123',
      });
      expect(loginRes.user.name).toBe('');
      await db.collection('user').deleteOne({ email: noNameEmail });

      // 4. Google login with string company reference
      const gEmail = `g_str_${Date.now()}@density.com`;
      const compUuid = 'g-str-comp-' + Date.now();
      await db.collection('company').insertOne({ company_id: compUuid, name: 'String Comp Corp' });
      await db.collection('user').insertOne({
        email: gEmail,
        name: null,
        company: compUuid,
        company_id: compUuid,
        password: 'pbkdf2_sha256$600000$salt$hash',
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify({
        email: gEmail,
        name: null,
        sub: '998877',
        aud: env.GOOGLE_CLIENT_ID,
        email_verified: 'true',
      }), { status: 200 });

      try {
        const gRes = await AuthService.googleLogin({ credential: 'str-token' });
        expect(gRes.user.email).toBe(gEmail);
        expect(gRes.user.name).toBe('');
      } finally {
        globalThis.fetch = origFetch;
        await db.collection('user').deleteOne({ email: gEmail });
        await db.collection('company').deleteOne({ company_id: compUuid });
      }
    });
  });

  describe('InventoryService Branch Coverage Exhaustion', () => {
    it('exhausts all item and warehouse edge branches, validation errors, and WIP live mappings', async () => {
      // 1. Item creation with undefined/default optional values
      const defaultItem = await InventoryService.createItem(scope, 'finished', {
        name: 'Default Props Item',
      });
      expect(defaultItem.unit).toBe('pcs');
      expect(defaultItem.selling_price).toBe(0);
      expect(defaultItem.cost_price).toBe(0);
      expect(defaultItem.quantity).toBe(0);
      expect(defaultItem.reorder_level).toBe(0);
      expect(defaultItem.warehouse_id).toBeNull();
      expect(defaultItem.image_url).toBeNull();

      // 2. Item update validation and full-field updates
      await expect(InventoryService.updateItem(scope, 'finished', 'bad-id', {})).rejects.toThrow(ValidationError);
      await expect(InventoryService.updateItem(scope, 'finished', new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      await expect(InventoryService.updateItem(scope, 'raw_material', defaultItem.id, {})).rejects.toThrow(NotFoundError);

      const wh = await InventoryService.createWarehouse(scope, { name: 'Density Warehouse', location: 'Section D' });
      await expect(
        InventoryService.updateItem(scope, 'finished', defaultItem.id, { quantity: 50 })
      ).rejects.toThrow('Finished stock changes only through production and shipments.');

      const updated = await InventoryService.updateItem(scope, 'finished', defaultItem.id, {
        name: 'Updated Props Item',
        unit: 'box',
        selling_price: 150.5,
        cost_price: 100.0,
        reorder_level: 10,
        warehouse_id: wh.id,
        image_url: 'https://test.com/item.png',
      });
      expect(updated.unit).toBe('box');
      expect(updated.selling_price).toBe(150.5);
      expect(updated.warehouse_id).toBe(wh.id);
      expect(updated.warehouse_name).toBe('Density Warehouse');

      // 3. Item delete validation
      await expect(InventoryService.deleteItem(scope, 'finished', 'bad-id')).rejects.toThrow(ValidationError);
      await expect(InventoryService.deleteItem(scope, 'finished', new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await expect(InventoryService.deleteItem(scope, 'raw_material', defaultItem.id)).rejects.toThrow(NotFoundError);

      // 4. Warehouse validation and updates
      await expect(InventoryService.createWarehouse(scope, { name: '   ' })).rejects.toThrow(ValidationError);
      const wh2 = await InventoryService.createWarehouse(scope, { name: 'Temporary WH' });
      await expect(InventoryService.updateWarehouse(scope, 'bad-id', {})).rejects.toThrow(ValidationError);
      await expect(InventoryService.updateWarehouse(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      await InventoryService.updateWarehouse(scope, wh2.id, { name: 'Updated WH Name', location: 'Loc 2' });
      await expect(InventoryService.deleteWarehouse(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(InventoryService.deleteWarehouse(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await InventoryService.deleteWarehouse(scope, wh2.id);

      // 5. getLiveSemiFinished branches: worker types, bill buyer null/defined, and unassigned
      const workerOid = new ObjectId();
      await db.collection('workers').insertOne({
        _id: workerOid,
        company_id: companyId,
        name: 'WIP Artisan',
      });

      const billWithBuyer = new ObjectId();
      await db.collection('bills').insertOne({
        _id: billWithBuyer,
        company_id: companyId,
        invoice_number: 'INV-WIP-01',
        order_status: 'in_progress',
        buyer: { name: 'Buyer Corp' },
      });

      const billNoBuyer = new ObjectId();
      await db.collection('bills').insertOne({
        _id: billNoBuyer,
        company_id: companyId,
        invoice_number: 'INV-WIP-02',
        order_status: 'pending',
        buyer: null,
      });

      // Assignment 1: worker as ObjectId, linked to billWithBuyer
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        material_name: 'Raw Silk',
        quantity: 100,
        worker: workerOid,
        bill_id: billWithBuyer.toString(),
        status: 'open',
        batches: [{ quantity: 30, date: new Date() }],
        assignment_date: new Date(),
      });

      // Assignment 2: worker as string, linked to billNoBuyer
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        material_name: 'Cotton Yarn',
        quantity: 50,
        worker: workerOid.toString(),
        bill_id: billNoBuyer.toString(),
        status: 'open',
        batches: null,
        assignment_date: new Date(),
      });

      // Assignment 3: worker unassigned, no bill
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        material_name: 'Linen',
        quantity: 25,
        worker: null,
        worker_id: null,
        bill_id: null,
        status: 'open',
        batches: [],
        assignment_date: new Date(),
      });

      // Assignment 4: null material_name and bill with null invoice_number & order_status
      const billNullFields = new ObjectId();
      await db.collection('bills').insertOne({
        _id: billNullFields,
        company_id: companyId,
        invoice_number: null,
        order_status: null,
        buyer: null,
      });
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        material_name: null,
        quantity: 10,
        worker_id: workerOid.toString(),
        bill_id: billNullFields.toString(),
        status: 'open',
        batches: [{ quantity: 5 }],
        assignment_date: null,
      });

      const live = await InventoryService.getLiveSemiFinished(scope);
      expect(live.in_production.length).toBeGreaterThanOrEqual(3);
      const unassigned = live.in_production.find((p) => p.name === 'Linen');
      expect(unassigned?.location_label).toBe('Worker unassigned');
      expect(unassigned?.worker_name).toBeNull();

      const withBuyerProd = live.in_production.find((p) => p.name === 'Raw Silk');
      expect(withBuyerProd?.order?.buyer_name).toBe('Buyer Corp');

      const noBuyerProd = live.in_production.find((p) => p.name === 'Cotton Yarn');
      expect(noBuyerProd?.order?.buyer_name).toBeNull();

      // 6. Warehouse Summary with custom item types and edge quantities
      await db.collection('inventory_items').insertOne({
        company_id: companyId,
        name: 'Custom Package Item',
        type: 'custom_type',
        quantity: 10,
        cost_price: 25,
        warehouse_id: wh.id,
      });

      // Item with null type and null cost_price to test fallbacks
      await db.collection('inventory_items').insertOne({
        company_id: companyId,
        sku: 'SKU-FALLBACK-01',
        name: 'Fallback Item',
        type: null,
        cost_price: null,
        quantity: null,
        warehouse_id: wh.id,
      });

      const summary = await InventoryService.getWarehouseSummary(scope);
      expect(summary.length).toBeGreaterThan(0);
      const whSummary = summary.find((s) => s.warehouse.id === wh.id);
      expect(whSummary?.by_type.custom_type).toBeDefined();
    });
  });

  describe('WorkersService Branch Coverage Exhaustion', () => {
    it('exhausts all worker CRUD, payment validations, and assignment states', async () => {
      // 1. Create worker with null/empty values and is_active: false
      await expect(WorkersService.createWorker(scope, { name: '' })).rejects.toThrow(ValidationError);
      const inactiveWorker = await WorkersService.createWorker(scope, {
        name: 'Inactive Worker',
        age: 'invalid-nan-age',
        address: '',
        phone: '',
        is_active: false,
      });
      expect(inactiveWorker.age).toBeNull();
      expect(inactiveWorker.is_active).toBe(false);

      // 2. Update worker validation and partial fields
      await expect(WorkersService.updateWorker(scope, 'bad-id', {})).rejects.toThrow(ValidationError);
      await expect(WorkersService.updateWorker(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      const updatedWorker = await WorkersService.updateWorker(scope, inactiveWorker.id, {
        name: 'Reactivated Worker',
        age: 35,
        address: '100 Main St',
        phone: '1234567890',
        is_active: true,
      });
      expect(updatedWorker.age).toBe(35);
      expect(updatedWorker.is_active).toBe(true);

      // 3. Worker serialization with diverse payments and assignments
      const testWorker = await WorkersService.createWorker(scope, { name: 'Full Stats Worker' });
      // Payment: unpaid, partial
      await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker_id: testWorker.id,
        units_produced: 10,
        rate_per_unit: 20,
        amount_paid: 50,
        paid: false,
        date: new Date(),
      });
      // Payment: already fully paid
      await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker_id: testWorker.id,
        units_produced: 5,
        rate_per_unit: 10,
        amount_paid: 50,
        paid: true,
        date: new Date(),
      });
      // Assignment: completed with wastage
      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        worker_id: testWorker.id,
        material_name: 'Thread',
        quantity: 100,
        wastage_quantity: 10,
        status: 'completed',
        batches: [{ quantity: 90 }],
        created_at: new Date(),
      });

      const workerDetail = await WorkersService.getWorker(scope, testWorker.id);
      expect(workerDetail.pending_amount).toBe(150); // (200 - 50)
      expect(workerDetail.wastage_rate).toBe(10);
      expect(workerDetail.material_assigned).toBe(100);
      expect(workerDetail.material_delivered).toBe(90);

      // 4. Material assignment validations
      await expect(WorkersService.createMaterial(scope, 'bad-id', { material_name: 'M', quantity: 1, price_per_unit: 1 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createMaterial(scope, new ObjectId().toString(), { material_name: 'M', quantity: 1, price_per_unit: 1 })).rejects.toThrow(NotFoundError);
      await expect(WorkersService.createMaterial(scope, testWorker.id, { material_name: '', quantity: 1, price_per_unit: 1 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createMaterial(scope, testWorker.id, { material_name: 'M', quantity: -1, price_per_unit: 1 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createMaterial(scope, testWorker.id, { material_name: 'M', quantity: 1, price_per_unit: -5 })).rejects.toThrow(ValidationError);

      const rawItem = await InventoryService.createItem(scope, 'raw', {
        name: 'Canvas Raw Fabric',
        quantity: 100,
        unit: 'm',
      });
      const workerBill = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Canvas', quantity: 50, rate: 20 }],
      });

      const assignment = await WorkersService.createMaterial(scope, testWorker.id, {
        bill_id: workerBill.id,
        raw_item_id: rawItem.id,
        material_name: 'Canvas',
        quantity: 50,
        price_per_unit: 10,
        wage_amount: 150,
      });

      // 5. Add batch validations
      await expect(WorkersService.addBatch(scope, 'bad-id', { quantity: 10 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.addBatch(scope, new ObjectId().toString(), { quantity: 10 })).rejects.toThrow(NotFoundError);
      await expect(WorkersService.addBatch(scope, assignment.id, { quantity: 0 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.addBatch(scope, assignment.id, { quantity: -5 })).rejects.toThrow(ValidationError);

      const batched = await WorkersService.addBatch(scope, assignment.id, { quantity: 20, notes: 'Batch 1' });
      expect(batched.delivered_quantity).toBe(20);
      expect(batched.balance_quantity).toBe(30);

      // 6. Complete assignment validations
      await expect(WorkersService.completeAssignment(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.completeAssignment(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const completed = await WorkersService.completeAssignment(scope, assignment.id);
      expect(completed.status).toBe('completed');
      expect(completed.pay_record_id).toBeDefined();

      // Attempting to add batch to completed assignment throws
      await expect(WorkersService.addBatch(scope, assignment.id, { quantity: 5 })).rejects.toThrow(
        'Cannot add batch: assignment is not open.'
      );

      // 7. Payment validations and edge flows
      await expect(WorkersService.createPayment(scope, 'bad-id', { product_name: 'P', units_produced: 1, rate_per_unit: 1, amount_paid: 0 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createPayment(scope, new ObjectId().toString(), { product_name: 'P', units_produced: 1, rate_per_unit: 1, amount_paid: 0 })).rejects.toThrow(NotFoundError);
      await expect(WorkersService.createPayment(scope, testWorker.id, { product_name: 'P', units_produced: 0, rate_per_unit: 1, amount_paid: 0 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createPayment(scope, testWorker.id, { product_name: 'P', units_produced: 1, rate_per_unit: 0, amount_paid: 0 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createPayment(scope, testWorker.id, { product_name: 'P', units_produced: 1, rate_per_unit: 1, amount_paid: -10 })).rejects.toThrow(ValidationError);

      const pay = await WorkersService.createPayment(scope, testWorker.id, {
        product_name: 'Handloom Shawl',
        units_produced: 2,
        rate_per_unit: 500,
        amount_paid: 0,
      });
      expect(pay.paid).toBe(false);

      await expect(WorkersService.recordPartialPayment(scope, 'bad-id', 100)).rejects.toThrow(ValidationError);
      await expect(WorkersService.recordPartialPayment(scope, new ObjectId().toString(), 100)).rejects.toThrow(NotFoundError);
      await expect(WorkersService.recordPartialPayment(scope, pay.id, 0)).rejects.toThrow(ValidationError);

      const partial = await WorkersService.recordPartialPayment(scope, pay.id, 400);
      expect(partial.amount_paid).toBe(400);
      expect(partial.paid).toBe(false);

      await expect(WorkersService.markPaymentPaid(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.markPaymentPaid(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const full = await WorkersService.markPaymentPaid(scope, pay.id);
      expect(full.paid).toBe(true);
      expect(full.amount_paid).toBe(1000);

      // 7b. Additional edge branches for WorkersService
      // Overpaid payment throws
      await expect(
        WorkersService.createPayment(scope, testWorker.id, {
          product_name: 'Overpay Item',
          units_produced: 1,
          rate_per_unit: 100,
          amount_paid: 200,
        })
      ).rejects.toThrow('cannot exceed the total owed');

      // Attempting to pay an already paid record throws
      await expect(
        WorkersService.recordPartialPayment(scope, pay.id, 50)
      ).rejects.toThrow('This payment record is already fully paid.');

      // Already completed assignment throws
      await expect(
        WorkersService.completeAssignment(scope, assignment.id)
      ).rejects.toThrow('This assignment is already marked complete.');

      // Assignment linked to a bill, with delivered batches and wage amount
      const silkRaw = await InventoryService.createItem(scope, 'raw', {
        name: 'Silk Raw',
        quantity: 50,
        unit: 'kg',
      });
      const linkedBillId = new ObjectId();
      await db.collection('bills').insertOne({
        _id: linkedBillId,
        company_id: companyId,
        bill_type: 'kacha',
        invoice_number: 'INV-LINKED-' + Date.now(),
        products: [{ name: 'Silk Thread', quantity: 20, rate: 10 } as any],
        worker_assignment_ids: [],
      });

      const billLinkedAssignment = await WorkersService.createMaterial(scope, testWorker.id, {
        bill_id: linkedBillId.toString(),
        raw_item_id: silkRaw.id,
        material_name: 'Silk Thread',
        quantity: 20,
        price_per_unit: 5,
        wage_amount: 50,
      });
      await WorkersService.addBatch(scope, billLinkedAssignment.id, { quantity: 15 });
      const completedLinked = await WorkersService.completeAssignment(scope, billLinkedAssignment.id);
      expect(completedLinked.status).toBe('completed');
      expect(completedLinked.wastage_quantity).toBe(5);

      // Payment with null/non-existent worker
      const orphanPayment = await db.collection('pay_records').insertOne({
        company_id: companyId,
        worker: null,
        worker_id: null,
        product_name: 'Orphan Item',
        units_produced: 2,
        rate_per_unit: 50,
        amount_paid: 10,
        paid: false,
        date: new Date(),
      });
      const partialOrphan = await WorkersService.recordPartialPayment(scope, orphanPayment.insertedId.toString(), 20);
      expect(partialOrphan.amount_paid).toBe(30);
      const paidOrphan = await WorkersService.markPaymentPaid(scope, orphanPayment.insertedId.toString());
      expect(paidOrphan.paid).toBe(true);

      // 8. Delete worker validation
      await expect(WorkersService.deleteWorker(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.deleteWorker(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await expect(WorkersService.deleteWorker(scope, testWorker.id)).rejects.toThrow('Worker has production history. Deactivate the worker instead.');
      const cleanWorker = await WorkersService.createWorker(scope, { name: 'Clean Worker' });
      await WorkersService.deleteWorker(scope, cleanWorker.id);
    });
  });

  describe('BillsService Branch Coverage Exhaustion', () => {
    it('exhausts all bill lifecycle operations, payment recording, costs, and profit flows', async () => {
      // 1. Bill creation validations
      await expect(BillsService.createBill(scope, 'kacha', { products: [] })).rejects.toThrow(ValidationError);

      // 2. Create valid kacha bill with linked inventory item
      const invItem = await InventoryService.createItem(scope, 'finished', {
        name: 'Stock Guard Product',
        quantity: 100,
        cost_price: 50,
        selling_price: 100,
      });

      const bill = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        buyer: { name: 'Density Buyer', address: '123 Market St', phone: '9988776655' },
        products: [
          { name: 'Stock Guard Product', quantity: 10, rate: 100, inventory_item_id: invItem.id },
        ],
        discount: 50,
      });
      expect(bill.bill_type).toBe('kacha');
      expect(bill.subtotal).toBe(1000);
      expect(bill.grand_total).toBe(950);

      // Verify stock was decremented
      const checkStock1 = await InventoryRepository.findItemById(scope, invItem.id);
      expect(checkStock1?.quantity).toBe(90);

      // 3. Bill update validations
      await expect(BillsService.updateBill(scope, 'bad-id', {})).rejects.toThrow(ValidationError);
      await expect(BillsService.updateBill(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      await expect(BillsService.updateBill(scope, bill.id, { bill_type: 'pakka' as any })).rejects.toThrow(
        'Bill type cannot be changed via update.'
      );

      // Update bill products (adjust stock delta)
      const updatedBill = await BillsService.updateBill(scope, bill.id, {
        products: [
          { name: 'Stock Guard Product', quantity: 15, rate: 100, inventory_item_id: invItem.id },
        ],
        discount: 100,
      });
      expect(updatedBill.grand_total).toBe(1400);
      const checkStock2 = await InventoryRepository.findItemById(scope, invItem.id);
      expect(checkStock2?.quantity).toBe(85);

      // 4. Record payments
      await expect(BillsService.recordPayment(scope, 'bad-id', { amount: 100 })).rejects.toThrow(ValidationError);
      await expect(BillsService.recordPayment(scope, new ObjectId().toString(), { amount: 100 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.recordPayment(scope, bill.id, { amount: 0 })).rejects.toThrow(ValidationError);
      await expect(BillsService.recordPayment(scope, bill.id, { amount: -50 })).rejects.toThrow(ValidationError);

      const paidBill = await BillsService.recordPayment(scope, bill.id, {
        amount: 700,
        date: '2026-10-16',
        notes: 'Deposit',
      });
      expect(paidBill.amount_received).toBe(700);
      expect(paidBill.balance_due).toBe(700);
      expect(paidBill.payment_status).toBe('partial');

      // 5. Transportation and misc costs
      await expect(BillsService.addTransportationCost(scope, 'bad-id', { amount: 50 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addTransportationCost(scope, new ObjectId().toString(), { amount: 50 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addTransportationCost(scope, bill.id, { amount: 0 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addMiscCost(scope, 'bad-id', { amount: 25 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addMiscCost(scope, new ObjectId().toString(), { amount: 25 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addMiscCost(scope, bill.id, { amount: -10 })).rejects.toThrow(ValidationError);

      await BillsService.addTransportationCost(scope, bill.id, { amount: 80, notes: 'Logistics' });
      await BillsService.addMiscCost(scope, bill.id, { amount: 20, notes: 'Packaging' });

      // 6. Shipment validations
      await expect(BillsService.createShipment(scope, 'bad-id', { ship_all: true })).rejects.toThrow(ValidationError);
      await expect(BillsService.createShipment(scope, new ObjectId().toString(), { ship_all: true })).rejects.toThrow(NotFoundError);

      // 7. Confirm profit & Reopen profit
      await expect(BillsService.confirmProfit(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.confirmProfit(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const confirmedProfitBill = await BillsService.confirmProfit(scope, bill.id, 450);
      expect(confirmedProfitBill.profit_confirmed).toBe(true);
      expect(confirmedProfitBill.profit_confirmed_amount).toBe(450);

      await expect(BillsService.reopenProfit(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.reopenProfit(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const reopenedProfitBill = await BillsService.reopenProfit(scope, bill.id);
      expect(reopenedProfitBill.profit_confirmed).toBe(false);
      expect(reopenedProfitBill.profit_confirmed_amount).toBeNull();

      // 8. Convert kacha to pakka
      await expect(BillsService.convertToPakka(scope, 'bad-id', { gst_number: '27AAAAA0000A1Z5', gst_percentage: 18 })).rejects.toThrow(ValidationError);
      await expect(BillsService.convertToPakka(scope, new ObjectId().toString(), { gst_number: '27AAAAA0000A1Z5', gst_percentage: 18 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.convertToPakka(scope, bill.id, { gst_number: '', gst_percentage: 18 })).rejects.toThrow(ValidationError);

      const convertedBill = await BillsService.convertToPakka(scope, bill.id, {
        gst_number: '27AAAAA0000A1Z5',
        gst_percentage: 18,
      });
      expect(convertedBill.bill_type).toBe('pakka');
      expect(convertedBill.gst_percentage).toBe(18);

      // Attempting to convert again throws
      await expect(
        BillsService.convertToPakka(scope, bill.id, { gst_number: '27AAAAA0000A1Z5', gst_percentage: 18 })
      ).rejects.toThrow('Bill is already a pakka (formal) bill.');

      // 9. Delete bill restores stock
      await expect(BillsService.deleteBill(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.deleteBill(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await BillsService.deleteBill(scope, bill.id);

      // Verify that bill deletion restored the 15 units of stock
      const checkStockFinal = await InventoryRepository.findItemById(scope, invItem.id);
      expect(checkStockFinal?.quantity).toBe(100);

      // 10. Stock Rollback on Bill Creation Failure
      const origInsert = BillsRepository.insertBillWithRetry;
      BillsRepository.insertBillWithRetry = async () => {
        throw new Error('Database write failed during bill insert');
      };
      try {
        await expect(
          BillsService.createBill(scope, 'kacha', {
            workflow: 'legacy' as any,
            products: [{ name: 'Rollback Prod', quantity: 10, rate: 100, inventory_item_id: invItem.id }],
          })
        ).rejects.toThrow('Database write failed during bill insert');
        const checkRollback = await InventoryRepository.findItemById(scope, invItem.id);
        expect(checkRollback?.quantity).toBe(100); // Fully restored!
      } finally {
        BillsRepository.insertBillWithRetry = origInsert;
      }

      // 11. Convert to Pakka with New Products and Stock Adjustments
      const convItem = await InventoryService.createItem(scope, 'finished', {
        name: 'Convertible Item',
        quantity: 50,
      });
      const kachaForConv = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        products: [{ name: 'Convertible Item', quantity: 5, rate: 100, inventory_item_id: convItem.id }],
      });
      // Convert with increased product quantity (deducts net 5 more)
      const convWithMore = await BillsService.convertToPakka(scope, kachaForConv.id, {
        gst_number: '27AAAAA0000A1Z5',
        gst_percentage: 18,
        products: [{ name: 'Convertible Item', quantity: 10, rate: 100, inventory_item_id: convItem.id }],
      });
      expect(convWithMore.bill_type).toBe('pakka');
      const checkStockConv = await InventoryRepository.findItemById(scope, convItem.id);
      expect(checkStockConv?.quantity).toBe(40); // 50 - 10

      // 12. Profit Preview & Confirm Fallback
      const prevBill = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        products: [{ name: 'Item', quantity: 2, rate: 200 }],
      });
      await BillsService.recordPayment(scope, prevBill.id, { amount: 400 });
      const preview = await BillsService.getProfitPreview(scope, prevBill.id);
      expect(preview.suggested_profit).toBe(400);

      // Confirm profit without explicit amount (falls back to suggested profit)
      const autoConfirmed = await BillsService.confirmProfit(scope, prevBill.id);
      expect(autoConfirmed.profit_confirmed).toBe(true);
      expect(autoConfirmed.profit_confirmed_amount).toBe(400);

      // Profit preview on already confirmed bill
      const confirmedPreview = await BillsService.getProfitPreview(scope, prevBill.id);
      expect(confirmedPreview.revenue_collected).toBe(400);

      // 13. Bill Assignments lookup
      await expect(BillsService.getBillAssignments(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.getBillAssignments(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const billAssigns = await BillsService.getBillAssignments(scope, prevBill.id);
      expect(billAssigns).toEqual([]);
    });

    it('exhausts WorkersService string batches, list helpers, and partial updates', async () => {
      const w = await WorkersService.createWorker(scope, { name: 'Branch Worker' });
      // Partial updates
      await WorkersService.updateWorker(scope, w.id, { address: 'New Address' });
      await WorkersService.updateWorker(scope, w.id, { phone: '1122334455' });
      await WorkersService.updateWorker(scope, w.id, { image_url: 'https://test.com/w.jpg' });
      await WorkersService.updateWorker(scope, w.id, { is_active: false });

      // Worker is inactive -> throws ValidationError
      await expect(
        WorkersService.createMaterial(scope, w.id, {
          material_name: 'Raw Cotton',
          quantity: 20,
          price_per_unit: 5,
        })
      ).rejects.toThrow('Worker is inactive.');

      // Reactivate worker
      await WorkersService.updateWorker(scope, w.id, { is_active: true });

      const rawItem4 = await InventoryService.createItem(scope, 'raw', {
        name: 'Raw Cotton Material',
        quantity: 50,
        unit: 'kg',
      });
      const workerBill4 = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Raw Cotton', quantity: 20, rate: 10 }],
      });

      const mat = await WorkersService.createMaterial(scope, w.id, {
        bill_id: workerBill4.id,
        raw_item_id: rawItem4.id,
        material_name: 'Raw Cotton',
        quantity: 20,
        price_per_unit: 5,
      });

      // addBatch integer parsing and date fallbacks
      await expect(WorkersService.addBatch(scope, mat.id, { quantity: '10.5' as any })).rejects.toThrow(
        'Batch quantity must be an integer.'
      );
      const stringBatch = await WorkersService.addBatch(scope, mat.id, {
        quantity: '5' as any,
        date: 'invalid-date-string',
      });
      expect(stringBatch.delivered_quantity).toBe(5);

      // listMaterials with workerId
      await expect(WorkersService.listMaterials(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.listMaterials(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const wAssigns = await WorkersService.listMaterials(scope, w.id);
      expect(wAssigns.length).toBe(1);

      // listPayments with workerId
      await expect(WorkersService.listPayments(scope, 'bad-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.listPayments(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const wPays = await WorkersService.listPayments(scope, w.id);
      expect(wPays.length).toBe(0);

      // recordPartialPayment with string amount
      const pay = await WorkersService.createPayment(scope, w.id, {
        product_name: 'Stitched Garment',
        units_produced: 10,
        rate_per_unit: 50,
      });
      const strPaid = await WorkersService.recordPartialPayment(scope, pay.id, '250' as any);
      expect(strPaid.amount_paid).toBe(250);
    });

    it('exhausts InventoryService partial warehouse updates and edge item serializations', async () => {
      const wh = await InventoryService.createWarehouse(scope, { name: 'Partials WH' });
      // Update only location
      const locOnly = await InventoryService.updateWarehouse(scope, wh.id, { location: 'Bay 99' });
      expect(locOnly.location).toBe('Bay 99');

      // Update only name
      const nameOnly = await InventoryService.updateWarehouse(scope, wh.id, { name: 'Renamed WH' });
      expect(nameOnly.name).toBe('Renamed WH');

      // Update item with partial fields
      const item = await InventoryService.createItem(scope, 'finished', { name: 'Partial Item' });
      const updatedItem = await InventoryService.updateItem(scope, 'finished', item.id, {
        reorder_level: 5,
      });
      expect(updatedItem.reorder_level).toBe(5);
    });
  });
});
