import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo } from '../src/db/mongo.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { ValidationError, NotFoundError, UnauthorizedError, BadRequestError } from '../src/utils/errors.js';
import { generateTokens } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/crypto.js';

describe('C2: High-Density Branch Coverage Suite (Bills, Workers, Inventory, Auth)', () => {
  const companyId = 'c2-test-company-' + Date.now();
  const scope = { companyId, company_id: companyId };
  let db: any;

  beforeAll(async () => {
    db = await connectMongo();
    await db.collection('companies').deleteMany({ company_id: companyId });
    await db.collection('user').deleteMany({ company_id: companyId });
    await db.collection('inventory_items').deleteMany({ company_id: companyId });
    await db.collection('warehouses').deleteMany({ company_id: companyId });
    await db.collection('workers').deleteMany({ company_id: companyId });
    await db.collection('bills').deleteMany({ company_id: companyId });
    await db.collection('material_assignments').deleteMany({ company_id: companyId });
    await db.collection('pay_records').deleteMany({ company_id: companyId });
  });

  afterAll(async () => {
    if (db) {
      await db.collection('company').deleteMany({ $or: [{ company_id: { $regex: /^c2-|^comp-|^no-name-/ } }, { name: 'UUID Corp' }, { name: 'Obj Corp' }, { name: 'My Company' }] });
      await db.collection('user').deleteMany({ email: { $regex: /@test\.com$/ } });
      await db.collection('inventory_items').deleteMany({ company_id: companyId });
      await db.collection('warehouses').deleteMany({ company_id: companyId });
      await db.collection('workers').deleteMany({ company_id: companyId });
      await db.collection('bills').deleteMany({ company_id: companyId });
      await db.collection('material_assignments').deleteMany({ company_id: companyId });
      await db.collection('pay_records').deleteMany({ company_id: companyId });
    }
    await closeMongo();
  });

  describe('AuthService Branch Coverage', () => {
    it('handles login with ObjectId company, string UUID company, missing company, and company name fallbacks', async () => {
      const compUuid = 'comp-uuid-' + Date.now();
      await db.collection('company').insertOne({ company_id: compUuid, name: 'UUID Corp' });
      const pwHash = hashPassword('ValidPassword123!');
      const email1 = `u1_${Date.now()}@test.com`;
      await db.collection('user').insertOne({
        email: email1,
        password: pwHash,
        company: compUuid,
        name: 'User UUID',
      });

      const compObjId = new ObjectId();
      const compObjUuid = 'comp-obj-' + Date.now();
      await db.collection('company').insertOne({ _id: compObjId, company_id: compObjUuid, name: 'Obj Corp' });
      const email2 = `u2_${Date.now()}@test.com`;
      await db.collection('user').insertOne({
        email: email2,
        password: pwHash,
        company: compObjId,
        name: 'User Obj',
      });

      const email3 = `u3_${Date.now()}@test.com`;
      await db.collection('user').insertOne({
        email: email3,
        password: pwHash,
        company_id: 'orphan-comp-id',
        name: null,
      });

      const compNoName = new ObjectId();
      const compNoNameUuid = 'no-name-' + Date.now();
      await db.collection('company').insertOne({ _id: compNoName, company_id: compNoNameUuid });
      const email4 = `u4_${Date.now()}@test.com`;
      await db.collection('user').insertOne({
        email: email4,
        password: pwHash,
        company: compNoName,
      });

      const res1 = await AuthService.login({ email: email1, password: 'ValidPassword123!' });
      expect(res1.user.company_id).toBe(compUuid);
      expect(res1.user.company_name).toBe('UUID Corp');

      const res2 = await AuthService.login({ email: email2, password: 'ValidPassword123!' });
      expect(res2.user.company_id).toBe(compObjUuid);
      expect(res2.user.company_name).toBe('Obj Corp');

      const res3 = await AuthService.login({ email: email3, password: 'ValidPassword123!' });
      expect(res3.user.company_id).toBe('orphan-comp-id');
      expect(res3.user.name).toBe('');

      const res4 = await AuthService.login({ email: email4, password: 'ValidPassword123!' });
      expect(res4.user.company_name).toBe('My Company');
    });

    it('covers signup company name fallbacks and duplicate key handling', async () => {
      const unique = Date.now();
      const res1 = await AuthService.signup({
        name: 'Alice',
        email: `alice_${unique}@test.com`,
        password: 'ValidPassword123!',
        company_name: 'Alice Custom Co',
      });
      expect(res1.user.company_name).toBe('Alice Custom Co');

      const res2 = await AuthService.signup({
        name: 'Bob',
        email: `bob_${unique}@test.com`,
        password: 'ValidPassword123!',
      });
      expect(res2.user.company_name).toBe("Bob's Company");

      await expect(
        AuthService.signup({
          name: 'Bob Clone',
          email: `bob_${unique}@test.com`,
          password: 'ValidPassword123!',
        })
      ).rejects.toThrow(BadRequestError);

      const origCreateUser = AuthRepository.createUser;
      AuthRepository.createUser = async () => {
        const err: any = new Error('E11000 duplicate key error');
        err.code = 11000;
        throw err;
      };
      try {
        await expect(
          AuthService.signup({
            name: 'Charlie',
            email: `charlie_${unique}@test.com`,
            password: 'ValidPassword123!',
          })
        ).rejects.toThrow('Email already registered.');
      } finally {
        AuthRepository.createUser = origCreateUser;
      }

      AuthRepository.createUser = async () => {
        throw new Error('Database disk full failure');
      };
      try {
        await expect(
          AuthService.signup({
            name: 'Dan',
            email: `dan_${unique}@test.com`,
            password: 'ValidPassword123!',
          })
        ).rejects.toThrow('Database disk full failure');
      } finally {
        AuthRepository.createUser = origCreateUser;
      }
    });

    it('covers refresh with missing user', async () => {
      const tokens = generateTokens({ _id: new ObjectId(), email: 'ghost@test.com', name: 'Ghost' }, companyId);
      await expect(AuthService.refresh(tokens.refresh)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('InventoryService Branch Coverage', () => {
    it('covers item serialization, list, create, update, delete, and edge branches', async () => {
      const wh1 = await InventoryService.createWarehouse(scope, { name: 'Central Hub', location: 'Section A' });
      const wh2 = await InventoryService.createWarehouse(scope, { name: 'East Hub' });
      expect(wh1.location).toBe('Section A');
      expect(wh2.location).toBe('');

      const warehouses = await InventoryService.listWarehouses(scope);
      expect(warehouses.length).toBeGreaterThanOrEqual(2);

      await expect(InventoryService.createItem(scope, 'raw_material', { name: '   ' })).rejects.toThrow(ValidationError);

      const item1 = await InventoryService.createItem(scope, 'raw_material', {
        name: 'Fabric Bolt',
        unit: 'meters',
        selling_price: '150.50',
        cost_price: 100,
        quantity: '50',
        reorder_level: '10',
        warehouse_id: wh1.id,
        sku: 'SKU-FAB-001-' + Date.now(),
      });
      expect(item1.status).toBe('In Stock');
      expect(item1.warehouse_name).toBe('Central Hub');

      const item2 = await InventoryService.createItem(scope, 'raw_material', {
        name: 'Dye Packet',
        quantity: 0,
      });
      expect(item2.status).toBe('Out of Stock');
      expect(item2.warehouse_name).toBeNull();
      expect(item2.unit).toBe('pcs');

      const rawList = await InventoryService.listItems(scope, 'raw_material');
      expect(rawList.length).toBe(2);

      await expect(InventoryService.updateItem(scope, 'raw_material', 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(InventoryService.updateItem(scope, 'raw_material', new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      await expect(InventoryService.updateItem(scope, 'finished_good', item1.id, {})).rejects.toThrow(NotFoundError);

      const updated = await InventoryService.updateItem(scope, 'raw_material', item1.id, {
        name: 'Silk Fabric Bolt',
        unit: 'rolls',
        selling_price: 250,
        cost_price: '180.25',
        quantity: 0,
        reorder_level: 5,
        warehouse_id: wh2.id,
        image_url: 'https://example.com/silk.png',
      });
      expect(updated.name).toBe('Silk Fabric Bolt');
      expect(updated.unit).toBe('rolls');
      expect(updated.status).toBe('Out of Stock');
      expect(updated.warehouse_name).toBe('East Hub');
      expect(updated.image_url).toBe('https://example.com/silk.png');

      await expect(InventoryService.deleteItem(scope, 'raw_material', 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(InventoryService.deleteItem(scope, 'raw_material', new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await expect(InventoryService.deleteItem(scope, 'finished_good', item1.id)).rejects.toThrow(NotFoundError);

      await InventoryService.deleteItem(scope, 'raw_material', item2.id);
      const remaining = await InventoryService.listItems(scope, 'raw_material');
      expect(remaining.length).toBe(1);
    });

    it('covers getLiveSemiFinished derived assignments, bills, workers, and batches', async () => {
      await InventoryService.createItem(scope, 'semi_finished', {
        name: 'Cut Collar Piece',
        quantity: 20,
      });

      const billId = new ObjectId();
      await db.collection('bills').insertOne({
        _id: billId,
        company_id: companyId,
        invoice_number: 'INV-LIVE-001',
        order_status: 'In Progress',
        buyer: { name: 'Acme Garments' },
      });

      const workerId = new ObjectId();
      await db.collection('workers').insertOne({
        _id: workerId,
        company_id: companyId,
        name: 'Master Tailor Ram',
        is_active: true,
      });

      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        bill_id: billId,
        worker_id: workerId.toString(),
        material_name: 'Shirt Assembly',
        quantity: 100,
        status: 'open',
        batches: [
          { quantity: 40, date: new Date().toISOString() },
          { quantity: 20, date: new Date().toISOString() },
        ],
        created_at: new Date(),
      });

      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        worker: { _id: new ObjectId(), name: 'Apprentice Shyam' },
        material_name: 'Button Stitching',
        quantity: 50,
        status: 'open',
        batches: [{ quantity: 50, date: new Date().toISOString() }],
        created_at: new Date(),
      });

      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        worker: workerId,
        material_name: 'Hemming',
        quantity: 30,
        status: 'open',
        created_at: new Date(),
      });

      const live = await InventoryService.getLiveSemiFinished(scope);
      expect(Array.isArray(live.in_production)).toBe(true);
      expect(live.in_production.length).toBeGreaterThanOrEqual(2);
      const row1 = live.in_production.find((r: any) => r.name === 'Shirt Assembly');
      expect(row1).toBeDefined();
      expect(row1.quantity).toBe(40); // 100 - (40 + 20)
      expect(row1.worker_name).toBe('Master Tailor Ram');
      expect(row1.order?.invoice_number).toBe('INV-LIVE-001');
      expect(row1.order?.buyer_name).toBe('Acme Garments');
    });
  });

  describe('WorkersService Branch Coverage', () => {
    it('covers worker listing, filtering, search, pagination, updates, payments, and stats', async () => {
      await expect(WorkersService.createWorker(scope, { name: '  ' } as any)).rejects.toThrow(ValidationError);

      const worker1 = await WorkersService.createWorker(scope, {
        name: 'Rajesh Kumar',
        phone: '9876543210',
        age: 32,
        address: '123 Textile Street',
      });
      expect(worker1.name).toBe('Rajesh Kumar');
      expect(worker1.age).toBe(32);

      const worker2 = await WorkersService.createWorker(scope, {
        name: 'Suresh Patel',
        is_active: false,
      });

      const listAll = await WorkersService.listWorkers(scope);
      expect(listAll.length).toBeGreaterThanOrEqual(2);

      await expect(WorkersService.getWorker(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.getWorker(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);

      const fetched = await WorkersService.getWorker(scope, worker1.id);
      expect(fetched.name).toBe('Rajesh Kumar');

      // Create material assignment
      await expect(WorkersService.createMaterial(scope, 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(WorkersService.createMaterial(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      await expect(WorkersService.createMaterial(scope, worker1.id, { material_name: '' })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createMaterial(scope, worker1.id, { material_name: 'Cotton', quantity: -5 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createMaterial(scope, worker1.id, { material_name: 'Cotton', quantity: 10, price_per_unit: 0 })).rejects.toThrow(ValidationError);

      const mat1 = await WorkersService.createMaterial(scope, worker1.id, {
        material_name: 'Loom Thread',
        quantity: 50,
        price_per_unit: 10,
        notes: 'Fine count 40s',
      });
      expect(mat1.material_name).toBe('Loom Thread');
      expect(mat1.quantity).toBe(50);

      // Add batch
      await expect(WorkersService.addBatch(scope, 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(WorkersService.addBatch(scope, new ObjectId().toString(), { quantity: 10 })).rejects.toThrow(NotFoundError);
      await expect(WorkersService.addBatch(scope, mat1.id, { quantity: 0 })).rejects.toThrow(ValidationError);

      const batchRes = await WorkersService.addBatch(scope, mat1.id, {
        quantity: 25,
        notes: 'Batch 1 delivered',
      });
      expect(batchRes.batches.length).toBe(1);

      // List materials
      const materials = await WorkersService.listMaterials(scope, worker1.id);
      expect(materials.length).toBe(1);

      // Create payment
      await expect(WorkersService.createPayment(scope, 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(WorkersService.createPayment(scope, new ObjectId().toString(), { product_name: 'Shirt' })).rejects.toThrow(NotFoundError);
      await expect(WorkersService.createPayment(scope, worker1.id, { product_name: '' })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createPayment(scope, worker1.id, { product_name: 'Shirt', units_produced: -1 })).rejects.toThrow(ValidationError);
      await expect(WorkersService.createPayment(scope, worker1.id, { product_name: 'Shirt', units_produced: 10, rate_per_unit: -1 })).rejects.toThrow(ValidationError);

      const pay1 = await WorkersService.createPayment(scope, worker1.id, {
        product_name: 'Finished Shirt',
        units_produced: 100,
        rate_per_unit: 15,
        amount_paid: 1000,
      });
      expect(pay1.product_name).toBe('Finished Shirt');
      expect(pay1.total_amount).toBe(1500);
      expect(pay1.amount_paid).toBe(1000);
      expect(pay1.paid).toBe(false);

      const payments = await WorkersService.listPayments(scope, worker1.id);
      expect(payments.length).toBe(1);

      // Record partial payment
      await expect(WorkersService.recordPartialPayment(scope, 'invalid-id', 200)).rejects.toThrow(ValidationError);
      await expect(WorkersService.recordPartialPayment(scope, new ObjectId().toString(), 200)).rejects.toThrow(NotFoundError);
      await expect(WorkersService.recordPartialPayment(scope, pay1.id, 0)).rejects.toThrow(ValidationError);
      const partPay = await WorkersService.recordPartialPayment(scope, pay1.id, 250);
      expect(partPay.amount_paid).toBe(1250);
      expect(partPay.paid).toBe(false);

      // Mark payment paid
      await expect(WorkersService.markPaymentPaid(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.markPaymentPaid(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const settledPay = await WorkersService.markPaymentPaid(scope, pay1.id);
      expect(settledPay.paid).toBe(true);
      expect(settledPay.amount_paid).toBe(1500);

      // Complete assignment
      await expect(WorkersService.completeAssignment(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.completeAssignment(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const completedMat = await WorkersService.completeAssignment(scope, mat1.id);
      expect(completedMat.status).toBe('completed');

      // Update worker
      await expect(WorkersService.updateWorker(scope, 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(WorkersService.updateWorker(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);

      const updatedWorker = await WorkersService.updateWorker(scope, worker1.id, {
        phone: '9998887776',
        age: 33,
        is_active: false,
      });
      expect(updatedWorker.phone).toBe('9998887776');
      expect(updatedWorker.age).toBe(33);
      expect(updatedWorker.is_active).toBe(false);

      // Delete worker
      await expect(WorkersService.deleteWorker(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(WorkersService.deleteWorker(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await WorkersService.deleteWorker(scope, worker2.id);
    });
  });

  describe('BillsService Branch Coverage', () => {
    it('covers bill creation, validation, discounts, taxes, payments, profit, and queries', async () => {
      await expect(BillsService.createBill(scope, 'kacha', { products: [] })).rejects.toThrow(ValidationError);
      await expect(BillsService.createBill(scope, 'kacha', {} as any)).rejects.toThrow(ValidationError);

      // 1. Create kacha bill
      const kachaBill = await BillsService.createBill(scope, 'kacha', {
        buyer: { name: 'Gupta Traders', phone: '9811122233' },
        products: [
          { name: 'Cotton Roll', quantity: 10, rate: 100 },
          { name: 'Linen Roll', quantity: 5, rate: 200 },
        ],
        discount: 200,
      });
      expect(kachaBill.bill_type).toBe('kacha');
      expect(kachaBill.subtotal).toBe(2000);
      expect(kachaBill.discount).toBe(200);
      expect(kachaBill.grand_total).toBe(1800);
      expect(kachaBill.gst_percentage).toBe(0);

      // 2. Create pakka bill with GST
      const pakkaBill = await BillsService.createBill(scope, 'pakka', {
        buyer: { name: 'Metro Fashion', gst_number: '07AAAAA0000A1Z5' },
        products: [{ name: 'Designer Suit', quantity: 2, rate: 1500 }],
        discount: 100,
        gst_percentage: 5,
      });
      expect(pakkaBill.bill_type).toBe('pakka');
      expect(pakkaBill.subtotal).toBe(3000);
      expect(pakkaBill.gst_percentage).toBe(5);
      expect(pakkaBill.gst_amount).toBe(145);
      expect(pakkaBill.grand_total).toBe(3045);

      // 3. Query bills with filter
      const allBills = await BillsService.listBills(scope);
      expect(allBills.length).toBeGreaterThanOrEqual(2);

      const kachaList = await BillsService.listBills(scope, 'kacha');
      expect(kachaList.length).toBe(1);

      // 4. Get bill
      await expect(BillsService.getBill(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.getBill(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const single = await BillsService.getBill(scope, kachaBill.id);
      expect(single.id).toBe(kachaBill.id);

      // 5. Add payments
      await expect(BillsService.recordPayment(scope, 'invalid-id', { amount: 500 })).rejects.toThrow(ValidationError);
      await expect(BillsService.recordPayment(scope, new ObjectId().toString(), { amount: 500 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.recordPayment(scope, kachaBill.id, { amount: 0 })).rejects.toThrow(ValidationError);

      const partPaid = await BillsService.recordPayment(scope, kachaBill.id, {
        amount: 800,
        notes: 'Partial advance',
      });
      expect(partPaid.amount_received).toBe(800);
      expect(partPaid.balance_due).toBe(1000);
      expect(partPaid.payment_status).toBe('partial');

      const fullyPaid = await BillsService.recordPayment(scope, kachaBill.id, {
        amount: 1000,
        notes: 'Full settlement',
      });
      expect(fullyPaid.amount_received).toBe(1800);
      expect(fullyPaid.balance_due).toBe(0);
      expect(fullyPaid.payment_status).toBe('paid');

      // 6. Costs & ready to deliver
      await expect(BillsService.addTransportationCost(scope, 'invalid-id', { amount: 100 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addTransportationCost(scope, new ObjectId().toString(), { amount: 100 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addTransportationCost(scope, kachaBill.id, { amount: 0 })).rejects.toThrow(ValidationError);
      const withTrans = await BillsService.addTransportationCost(scope, kachaBill.id, { amount: 150, notes: 'Tempo' });
      expect(withTrans.transportation_cost_total).toBe(150);

      await expect(BillsService.addMiscCost(scope, 'invalid-id', { amount: 50 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addMiscCost(scope, new ObjectId().toString(), { amount: 50 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addMiscCost(scope, kachaBill.id, { amount: -10 })).rejects.toThrow(ValidationError);
      const withMisc = await BillsService.addMiscCost(scope, kachaBill.id, { amount: 75, notes: 'Packaging tape' });
      expect(withMisc.misc_cost_total).toBe(75);

      await expect(BillsService.addReadyToDeliver(scope, 'invalid-id', { quantity: 5 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addReadyToDeliver(scope, new ObjectId().toString(), { quantity: 5 })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addReadyToDeliver(scope, kachaBill.id, { inventory_item_id: 'bad-id', quantity: 5 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addReadyToDeliver(scope, kachaBill.id, { inventory_item_id: new ObjectId().toString(), quantity: 5 })).rejects.toThrow(NotFoundError);

      const realItem = await InventoryService.createItem(scope, 'finished_good', { name: 'Ready Shirt Pack', quantity: 30 });
      const withReady = await BillsService.addReadyToDeliver(scope, kachaBill.id, {
        inventory_item_id: realItem.id,
        quantity: 15,
        notes: 'Packed',
      });
      expect(withReady.ready_to_deliver_quantity).toBe(15);

      // Confirm shipment
      await expect(BillsService.confirmShipment(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.confirmShipment(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const shipped = await BillsService.confirmShipment(scope, kachaBill.id);
      expect(shipped.shipment_confirmed).toBe(true);

      // Confirm profit
      await expect(BillsService.confirmProfit(scope, 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(BillsService.confirmProfit(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      const prof = await BillsService.confirmProfit(scope, kachaBill.id, { confirmed_profit: 1575 });
      expect(prof.profit_confirmed).toBe(true);
      expect(prof.profit_confirmed_amount).toBe(1575);

      // Profit preview
      await expect(BillsService.getProfitPreview(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.getProfitPreview(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const preview = await BillsService.getProfitPreview(scope, kachaBill.id);
      expect(preview.revenue_collected).toBe(1800);
      expect(preview.cost_breakdown).toBeDefined();

      // Bill assignments
      await expect(BillsService.getBillAssignments(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.getBillAssignments(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      const billAssignments = await BillsService.getBillAssignments(scope, kachaBill.id);
      expect(Array.isArray(billAssignments)).toBe(true);

      // Convert bill
      await expect(BillsService.convertToPakka(scope, 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(BillsService.convertToPakka(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      await expect(BillsService.convertToPakka(scope, pakkaBill.id, {})).rejects.toThrow('Bill is already a pakka (formal) bill.');

      const kachaToConvert = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Convertible Item', quantity: 5, rate: 100 }],
      });
      await expect(BillsService.convertToPakka(scope, kachaToConvert.id, {})).rejects.toThrow('GST number is required to convert to pakka.');

      const converted = await BillsService.convertToPakka(scope, kachaToConvert.id, {
        gst_number: '07AAAAA1111A1Z9',
        gst_percentage: 12,
      });
      expect(converted.bill_type).toBe('pakka');
      expect(converted.gst_percentage).toBe(12);

      // Update bill edge branches: changing bill_type or missing GST on pakka
      await expect(
        BillsService.updateBill(scope, converted.id, { bill_type: 'kacha' })
      ).rejects.toThrow('Bill type cannot be changed via update.');

      // Update pakka bill missing GST number
      await expect(
        BillsService.updateBill(scope, converted.id, { buyer: { gst_number: '' } })
      ).rejects.toThrow('Cannot update pakka bill: missing required field');

      // Update with stock deltas (increasing & decreasing quantity)
      const stockItem = await InventoryService.createItem(scope, 'finished_good', {
        name: 'Stock Tracker Shirt',
        quantity: 50,
      });
      const billWithStock = await BillsService.createBill(scope, 'kacha', {
        products: [{ name: 'Stock Tracker Shirt', quantity: 10, rate: 200, inventory_item_id: stockItem.id }],
      });
      // Stock should have decreased by 10 to 40
      const afterCreateStock = await BillsRepository.findInventoryItemById(scope, stockItem.id);
      expect(afterCreateStock?.quantity).toBe(40);

      // Update quantity from 10 to 15 (net +5 deduction)
      await BillsService.updateBill(scope, billWithStock.id, {
        products: [{ name: 'Stock Tracker Shirt', quantity: 15, rate: 200, inventory_item_id: stockItem.id }],
      });
      const afterIncreaseStock = await BillsRepository.findInventoryItemById(scope, stockItem.id);
      expect(afterIncreaseStock?.quantity).toBe(35);

      // Update quantity from 15 to 5 (net -10 restoration)
      await BillsService.updateBill(scope, billWithStock.id, {
        products: [{ name: 'Stock Tracker Shirt', quantity: 5, rate: 200, inventory_item_id: stockItem.id }],
      });
      const afterRestoreStock = await BillsRepository.findInventoryItemById(scope, stockItem.id);
      expect(afterRestoreStock?.quantity).toBe(45);

      // Insufficient stock on update
      await expect(
        BillsService.updateBill(scope, billWithStock.id, {
          products: [{ name: 'Stock Tracker Shirt', quantity: 100, rate: 200, inventory_item_id: stockItem.id }],
        })
      ).rejects.toThrow('Insufficient stock');

      // Update bill
      await expect(BillsService.updateBill(scope, 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(BillsService.updateBill(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      const updatedBill = await BillsService.updateBill(scope, pakkaBill.id, {
        discount: 150,
      });
      expect(updatedBill.discount).toBe(150);

      // Delete bill
      await expect(BillsService.deleteBill(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(BillsService.deleteBill(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await BillsService.deleteBill(scope, pakkaBill.id);
    });

    it('covers exhaustive edge branches in bills: misc costs, ready to deliver, shipments, and assignments', async () => {
      const bill = await BillsService.createBill(scope, 'pakka', {
        products: [{ name: 'Jacket', quantity: 10, rate: 1000 }],
        buyer: { name: 'VIP Buyer', gst_number: '07AAAAA0000A1Z5' },
      });

      // 1. Misc Cost branches
      await expect(BillsService.addMiscCost(scope, 'invalid', { amount: 10 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addMiscCost(scope, bill.id, { amount: 0 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addMiscCost(scope, bill.id, { amount: -5 })).rejects.toThrow(ValidationError);
      await expect(BillsService.addMiscCost(scope, new ObjectId().toString(), { amount: 100 })).rejects.toThrow(NotFoundError);

      const withCost1 = await BillsService.addMiscCost(scope, bill.id, { amount: 200, notes: 'Packing cost', date: '2026-10-15' });
      expect(withCost1.misc_costs?.length).toBe(1);
      const withCost2 = await BillsService.addMiscCost(scope, bill.id, { amount: 50 }); // omitted notes and date
      expect(withCost2.misc_costs?.length).toBe(2);

      // 2. Ready to Deliver branches
      const fgItem = await InventoryService.createItem(scope, 'finished_good', { name: 'Jacket Stock', quantity: 20 });
      await expect(BillsService.addReadyToDeliver(scope, 'invalid', { quantity: 5, inventory_item_id: fgItem.id })).rejects.toThrow(ValidationError);
      await expect(BillsService.addReadyToDeliver(scope, new ObjectId().toString(), { quantity: 5, inventory_item_id: fgItem.id })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addReadyToDeliver(scope, bill.id, { quantity: 5, inventory_item_id: 'invalid-id' })).rejects.toThrow(ValidationError);
      await expect(BillsService.addReadyToDeliver(scope, bill.id, { quantity: 5, inventory_item_id: new ObjectId().toString() })).rejects.toThrow(NotFoundError);
      await expect(BillsService.addReadyToDeliver(scope, bill.id, { quantity: 0, inventory_item_id: fgItem.id })).rejects.toThrow(ValidationError);
      await expect(BillsService.addReadyToDeliver(scope, bill.id, { quantity: -1, inventory_item_id: fgItem.id })).rejects.toThrow(ValidationError);

      const withDelivery = await BillsService.addReadyToDeliver(scope, bill.id, {
        inventory_item_id: fgItem.id,
        quantity: 5,
        notes: 'First batch ready',
        date: '2026-10-15',
      });
      expect(withDelivery.ready_to_deliver?.length).toBe(1);

      // Add another without notes/date
      await BillsService.addReadyToDeliver(scope, bill.id, {
        inventory_item_id: fgItem.id,
        quantity: 3,
      });

      // 3. Confirm Shipment branches
      await expect(BillsService.confirmShipment(scope, 'invalid')).rejects.toThrow(ValidationError);
      await expect(BillsService.confirmShipment(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);

      const shipped = await BillsService.confirmShipment(scope, bill.id);
      expect(shipped.shipment_confirmed).toBe(true);

      // Cannot add ready to deliver once shipped
      await expect(
        BillsService.addReadyToDeliver(scope, bill.id, { inventory_item_id: fgItem.id, quantity: 1 })
      ).rejects.toThrow('This order has already been marked shipped.');

      // 4. Assignments linked to bill and getBillAssignments
      const worker = await WorkersService.createWorker(scope, { name: 'Master Tailor' });
      const assignment = await WorkersService.createMaterial(scope, worker.id, {
        material_name: 'Fabric',
        quantity: 10,
        price_per_unit: 50,
      });

      // Add batches
      await WorkersService.addBatch(scope, assignment.id, { quantity: 4, date: '2026-10-14' });
      await WorkersService.addBatch(scope, assignment.id, { quantity: 6 });

      // Complete assignment
      await WorkersService.completeAssignment(scope, assignment.id);

      // Call getBillAssignments
      await expect(BillsService.getBillAssignments(scope, 'invalid')).rejects.toThrow(ValidationError);
      await expect(BillsService.getBillAssignments(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);

      const billAssignments = await BillsService.getBillAssignments(scope, bill.id);
      expect(Array.isArray(billAssignments)).toBe(true);

      // 5. Query bills with filters
      const filter1 = await BillsService.listBills(scope, 'pakka');
      expect(filter1.length).toBeGreaterThanOrEqual(1);
      const filter2 = await BillsService.listBills(scope, 'kacha');
      expect(Array.isArray(filter2)).toBe(true);
      const filter3 = await BillsService.listBills(scope);
      expect(filter3.length).toBeGreaterThanOrEqual(1);
    });

    it('covers exhaustive edge branches in workers: payments with deleted workers, partial payment bounds, and cascade', async () => {
      const worker = await WorkersService.createWorker(scope, { name: 'Temporary Worker' });
      const payment = await WorkersService.createPayment(scope, worker.id, {
        product_name: 'Stitched Shirt',
        units_produced: 100,
        rate_per_unit: 10,
        amount_paid: 200,
      });

      // Partial payment edge cases
      await expect(WorkersService.recordPartialPayment(scope, 'invalid', 50)).rejects.toThrow(ValidationError);
      await expect(WorkersService.recordPartialPayment(scope, new ObjectId().toString(), 50)).rejects.toThrow(NotFoundError);
      await expect(WorkersService.recordPartialPayment(scope, payment.id, 0)).rejects.toThrow(ValidationError);
      await expect(WorkersService.recordPartialPayment(scope, payment.id, -10)).rejects.toThrow(ValidationError);

      // Delete worker and then pay remaining balance -> exercises fallback to 'Unknown'
      await db.collection('workers').deleteOne({ _id: new ObjectId(worker.id) });

      const partial = await WorkersService.recordPartialPayment(scope, payment.id, 300);
      expect(partial.amount_paid).toBe(500);
      expect(partial.worker_name).toBe('Unknown');

      // Fully pay remaining
      const fullyPaid = await WorkersService.markPaymentPaid(scope, payment.id);
      expect(fullyPaid.paid).toBe(true);
      expect(fullyPaid.amount_paid).toBe(1000);
      expect(fullyPaid.worker_name).toBe('Unknown');

      // Attempting to pay already fully paid record
      await expect(WorkersService.recordPartialPayment(scope, payment.id, 50)).rejects.toThrow('already fully paid');
    });

    it('covers inventory warehouses and edge stock adjustment branches', async () => {
      const wh = await InventoryService.createWarehouse(scope, { name: 'Main Depot', location: 'Sector 5' });
      expect(wh.name).toBe('Main Depot');

      // Update warehouse
      await expect(InventoryService.updateWarehouse(scope, 'invalid', { name: 'Test' })).rejects.toThrow(ValidationError);
      await expect(InventoryService.updateWarehouse(scope, new ObjectId().toString(), { name: 'Test' })).rejects.toThrow(NotFoundError);
      const updatedWh = await InventoryService.updateWarehouse(scope, wh.id, { location: 'Sector 6' });
      expect(updatedWh.location).toBe('Sector 6');

      // Delete warehouse
      await expect(InventoryService.deleteWarehouse(scope, 'invalid')).rejects.toThrow(ValidationError);
      await expect(InventoryService.deleteWarehouse(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await InventoryService.deleteWarehouse(scope, wh.id);

      // Warehouse summary
      const summary = await InventoryService.getWarehouseSummary(scope);
      expect(Array.isArray(summary)).toBe(true);
    });
  });
});
