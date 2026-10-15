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
import { env } from '../src/config/env.js';

describe('C2: Maximum Branch Density Suite', () => {
  const companyId = 'c2-dense-' + Date.now();
  const scope = { companyId, company_id: companyId };
  let db: any;

  beforeAll(async () => {
    db = await connectMongo();
    await db.collection('company').deleteMany({ company_id: companyId });
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
      await db.collection('company').deleteMany({ company_id: { $regex: /^c2-dense/ } });
      await db.collection('user').deleteMany({ company_id: { $regex: /^c2-dense/ } });
      await db.collection('inventory_items').deleteMany({ company_id: companyId });
      await db.collection('warehouses').deleteMany({ company_id: companyId });
      await db.collection('workers').deleteMany({ company_id: companyId });
      await db.collection('bills').deleteMany({ company_id: companyId });
      await db.collection('material_assignments').deleteMany({ company_id: companyId });
      await db.collection('pay_records').deleteMany({ company_id: companyId });
    }
    await closeMongo();
  });

  describe('AuthService Deep Edge Branches', () => {
    it('covers googleLogin error and fallback paths', async () => {
      const origFetch = globalThis.fetch;
      const testEmail = `g_${Date.now()}@test.com`;

      globalThis.fetch = async () => new Response(JSON.stringify({
        email: testEmail,
        name: 'Google User',
        sub: '12345',
        aud: env.GOOGLE_CLIENT_ID,
        email_verified: 'true',
      }), { status: 200 });

      const companyOid = new ObjectId();
      const compUuid = 'c2-dense-comp-' + Date.now();
      await db.collection('company').insertOne({ _id: companyOid, company_id: compUuid, name: 'Google Corp' });
      await db.collection('user').insertOne({
        email: testEmail,
        name: 'Google User',
        company: companyOid,
        company_id: compUuid,
        password: 'pbkdf2_sha256$600000$salt$mockpasswordhash12345678901234567890',
      });

      try {
        const res1 = await AuthService.googleLogin({ credential: 'valid-token' });
        expect(res1.user.company_name).toBe('Google Corp');

        // 2. Google user creation duplicate key branch
        const testEmail2 = `g2_${Date.now()}@test.com`;
        globalThis.fetch = async () => new Response(JSON.stringify({
          email: testEmail2,
          name: 'Google User 2',
          sub: '123456',
          aud: env.GOOGLE_CLIENT_ID,
          email_verified: 'true',
        }), { status: 200 });

        const origCreate = AuthRepository.createUser;
        let attempt = 0;
        AuthRepository.createUser = async () => {
          if (attempt === 0) {
            attempt++;
            await db.collection('user').insertOne({
              email: testEmail2,
              name: 'Google User 2',
              company: companyOid,
              company_id: compUuid,
              password: 'pbkdf2_sha256$600000$salt$mockpasswordhash12345678901234567890',
            });
            const err: any = new Error('E11000 duplicate key');
            err.code = 11000;
            throw err;
          }
          return new ObjectId();
        };

        try {
          const res2 = await AuthService.googleLogin({ credential: 'valid-token2' });
          expect(res2.user.email).toBe(testEmail2);
        } finally {
          AuthRepository.createUser = origCreate;
          await db.collection('user').deleteOne({ email: testEmail2 });
        }

        // 3. Non-11000 error rethrow during google user creation
        globalThis.fetch = async () => new Response(JSON.stringify({
          email: `g3_${Date.now()}@test.com`,
          name: 'Google User 3',
          sub: '1234567',
          aud: env.GOOGLE_CLIENT_ID,
          email_verified: 'true',
        }), { status: 200 });
        AuthRepository.createUser = async () => {
          throw new Error('Fatal DB crash');
        };

        try {
          await expect(AuthService.googleLogin({ credential: 'token3' })).rejects.toThrow('Fatal DB crash');
        } finally {
          AuthRepository.createUser = origCreate;
          globalThis.fetch = origFetch;
        }
      } finally {
        await db.collection('company').deleteOne({ _id: companyOid });
        await db.collection('user').deleteOne({ email: testEmail });
      }
    });
  });

  describe('BillsService Deep Serialization & Edge Paths', () => {
    it('covers all serialization optional fields, costs, payments, and preview calculations', async () => {
      const billId = new ObjectId();
      const itemId1 = new ObjectId();
      const itemId2 = new ObjectId();

      await db.collection('inventory_items').insertOne({
        _id: itemId1,
        company_id: companyId,
        name: 'Known Cost Item',
        cost_price: 50,
        quantity: 100,
      });

      await db.collection('bills').insertOne({
        _id: billId,
        company_id: companyId,
        invoice_number: 'INV-DEEP-001',
        bill_type: 'kacha',
        subtotal: 1000,
        grand_total: 1000,
        profit_confirmed: true,
        profit_confirmed_amount: 300,
        profit_confirmed_at: new Date(),
        profit_suggested_amount: 350,
        shipment_confirmed: true,
        shipment_confirmed_at: new Date(),
        products: [
          { name: 'Known Item', quantity: 10, rate: 80, inventory_item_id: itemId1.toString(), total: 800 },
          { name: 'Unknown Item', quantity: 2, rate: 100, inventory_item_id: itemId2.toString(), total: 200 },
          { name: 'Unlinked Item', quantity: 1, rate: 50, total: 50 },
        ],
        payments: [
          { amount: 500, date: new Date(), notes: 'Half payment' },
          { amount: 500, date: undefined, notes: undefined },
        ],
        transportation_costs: [
          { amount: 100, date: new Date(), notes: 'Truck' },
          { amount: 50, date: undefined, notes: undefined },
        ],
        misc_costs: [
          { amount: 30, date: new Date(), notes: 'Boxes' },
          { amount: 20, date: undefined, notes: undefined },
        ],
        ready_to_deliver: [
          { inventory_item_id: itemId1.toString(), item_name: 'Known Item', quantity: 5, date: new Date(), notes: 'Ready batch' },
          { inventory_item_id: itemId2.toString(), item_name: '', quantity: 5, date: undefined, notes: undefined },
        ],
        worker_assignment_ids: ['assign-fake-id'],
        created_at: new Date(),
        updated_at: new Date(),
      });

      await db.collection('pay_records').insertOne({
        company_id: companyId,
        bill_id: billId.toString(),
        units_produced: 20,
        rate_per_unit: 5,
        created_at: new Date(),
      });

      const workerId = new ObjectId();
      await db.collection('workers').insertOne({
        _id: workerId,
        company_id: companyId,
        name: 'Deep Worker',
      });

      await db.collection('material_assignments').insertOne({
        company_id: companyId,
        bill_id: billId.toString(),
        worker_id: workerId.toString(),
        material_name: 'Raw Cotton',
        quantity: 50,
        price_per_unit: 10,
        wage_amount: 200,
        status: 'open',
        batches: [
          { quantity: 20, date: new Date().toISOString() },
          { quantity: 35, date: undefined },
        ],
        created_at: new Date(),
      });

      const serialized = await BillsService.getBill(scope, billId.toString());
      expect(serialized.profit_confirmed).toBe(true);
      expect(serialized.shipment_confirmed).toBe(true);
      expect(serialized.transportation_cost_total).toBe(150);
      expect(serialized.misc_cost_total).toBe(50);
      expect(serialized.ready_to_deliver_quantity).toBe(10);
      expect(serialized.payments.length).toBe(2);

      const preview = await BillsService.getProfitPreview(scope, billId.toString());
      expect(preview.cost_breakdown.material_cost).toBe(500);
      expect(preview.cost_breakdown.worker_cost).toBe(100);
      expect(preview.cost_breakdown.transportation_cost).toBe(150);
      expect(preview.cost_breakdown.misc_cost).toBe(50);
      expect(preview.cost_basis_full).toBe(800);

      const assignments = await BillsService.getBillAssignments(scope, billId.toString());
      expect(assignments.length).toBe(1);
      expect(assignments[0].over_returned).toBe(true);
      expect(assignments[0].wage_amount).toBe(200);

      const pakkaId = new ObjectId();
      await db.collection('bills').insertOne({
        _id: pakkaId,
        company_id: companyId,
        invoice_number: 'INV-PAKKA-99',
        bill_type: 'pakka',
        gst_percentage: 18,
        buyer: { gst_number: '07AAAAA0000A1Z5' },
        products: [{ name: 'Suit', quantity: 1, rate: 500 }],
        subtotal: 500,
        grand_total: 590,
      });

      await expect(
        BillsService.updateBill(scope, pakkaId.toString(), {
          gst_percentage: null as any,
        })
      ).rejects.toThrow('Cannot update pakka bill: missing required field');
    });
  });

  describe('WorkersService Deep Edge Branches', () => {
    it('covers all batch, payment, and assignment edge branches', async () => {
      const worker = await WorkersService.createWorker(scope, {
        name: 'Deep Craftsperson',
        age: '28',
        joining_date: '2026-01-01',
      });

      const billId = new ObjectId();
      await db.collection('bills').insertOne({
        _id: billId,
        company_id: companyId,
        invoice_number: 'INV-B1-01',
      });

      await expect(
        WorkersService.createMaterial(scope, worker.id, {
          material_name: 'Silk',
          quantity: 10,
          price_per_unit: 100,
          bill_id: 'bad-bill-id',
        })
      ).rejects.toThrow('Invalid bill id.');

      await expect(
        WorkersService.createMaterial(scope, worker.id, {
          material_name: 'Silk',
          quantity: 10,
          price_per_unit: 100,
          bill_id: new ObjectId().toString(),
        })
      ).rejects.toThrow('That bill was not found for this company.');

      const mat = await WorkersService.createMaterial(scope, worker.id, {
        material_name: 'Silk Weave',
        quantity: 20,
        price_per_unit: 50,
        bill_id: billId.toString(),
      });
      expect(mat.bill_id).toBe(billId.toString());

      const pay = await WorkersService.createPayment(scope, worker.id, {
        product_name: 'Embroidered Border',
        units_produced: 50,
        rate_per_unit: 10,
        amount_paid: 200,
      });

      const payOver = await WorkersService.recordPartialPayment(scope, pay.id, 500);
      expect(payOver.amount_paid).toBe(700);
      expect(payOver.paid).toBe(true);

      await expect(
        WorkersService.recordPartialPayment(scope, pay.id, 50)
      ).rejects.toThrow('This payment record is already fully paid.');

      const settled = await WorkersService.markPaymentPaid(scope, pay.id);
      expect(settled.paid).toBe(true);
    });
  });

  describe('InventoryService Deep Edge Branches', () => {
    it('covers inventory adjustments, warehouse updates, and edge serialization', async () => {
      await expect(InventoryService.createWarehouse(scope, { name: '' })).rejects.toThrow(ValidationError);
      const wh = await InventoryService.createWarehouse(scope, { name: 'Storage Vault' });
      expect(wh.name).toBe('Storage Vault');

      await expect(InventoryService.updateWarehouse(scope, 'invalid-id', {})).rejects.toThrow(ValidationError);
      await expect(InventoryService.updateWarehouse(scope, new ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
      const updatedWh = await InventoryService.updateWarehouse(scope, wh.id, {
        name: 'Storage Vault Alpha',
        location: 'Bay 4',
      });
      expect(updatedWh.name).toBe('Storage Vault Alpha');
      expect(updatedWh.location).toBe('Bay 4');

      const summary = await InventoryService.getWarehouseSummary(scope);
      expect(summary.length).toBeGreaterThanOrEqual(1);

      const item = await InventoryService.createItem(scope, 'raw_material', {
        name: 'Thread Spool',
        quantity: 10,
      });

      await BillsRepository.adjustInventoryStockById(scope, item.id, 15);
      const fetchedItem = await InventoryRepository.findItemById(scope, item.id);
      expect(fetchedItem?.quantity).toBe(25);

      const successCond = await BillsRepository.adjustInventoryStockConditional(scope, item.id, -10, 10);
      expect(successCond).toBe(true);

      const failCond = await BillsRepository.adjustInventoryStockConditional(scope, item.id, -100, 100);
      expect(failCond).toBe(false);

      await expect(InventoryService.deleteWarehouse(scope, 'invalid-id')).rejects.toThrow(ValidationError);
      await expect(InventoryService.deleteWarehouse(scope, new ObjectId().toString())).rejects.toThrow(NotFoundError);
      await InventoryService.deleteWarehouse(scope, wh.id);
    });
  });
});
