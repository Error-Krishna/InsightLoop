import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import { ObjectId } from 'mongodb';
import { WebSocket } from 'ws';
import { connectMongo, closeMongo } from '../src/db/mongo.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { BillPdfService } from '../src/modules/bills/pdf.service.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/utils/crypto.js';
import { generateTokens } from '../src/utils/jwt.js';
import { setupWebSocketGateway, closeWebSockets } from '../src/ws/gateway.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { ValidationError, NotFoundError } from '../src/utils/errors.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('Branch Coverage C8 Depth Suite (High-Margin Resilience)', () => {
  const companyId = 'c8-depth-' + Date.now();
  const scope: TenantScope = { companyId, company_id: companyId };
  let db: any;

  beforeAll(async () => {
    db = await connectMongo();

    await db.collection('company').insertOne({
      _id: new ObjectId(),
      company_id: companyId,
      name: 'Depth Test Corp',
      business_type: 'Manufacturing',
      bank_account_number: '1234567890',
      bank_name: 'State Bank of India',
      branch_name: 'Industrial Area',
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  afterAll(async () => {
    if (db) {
      await db.collection('bills').deleteMany({ company_id: companyId });
      await db.collection('inventory_items').deleteMany({ company_id: companyId });
      await db.collection('material_assignments').deleteMany({ company_id: companyId });
      await db.collection('pay_records').deleteMany({ company_id: companyId });
      await db.collection('workers').deleteMany({ company_id: companyId });
      await db.collection('user').deleteMany({ company_id: companyId });
      await db.collection('company').deleteMany({ company_id: companyId });
      await db.collection('counters').deleteMany({ _id: { $regex: new RegExp(`_${companyId}`) } });
    }
    await closeMongo();
  });

  describe('1. BillsService Deep Branch Exhaustion', () => {
    it('covers stock validation with fractional quantities and deleted/null item fallbacks', async () => {
      // 1. Create item with 1.5 quantity
      const item = await InventoryService.createItem(scope, 'finished', {
        name: 'Fractional Item',
        quantity: 1.5,
        selling_price: 100,
        cost_price: 50,
        unit: 'kg',
      });

      // 2. Request 2.5 quantity -> fractional formatting in createBill error message
      await expect(
        BillsService.createBill(scope, 'kacha', {
          workflow: 'legacy' as any,
          buyer: { name: 'Test Buyer' },
          products: [{ name: 'Fractional Item', quantity: 2.5, rate: 100, inventory_item_id: item.id }],
        })
      ).rejects.toThrow(/requested 2.5 kg, only 1.5 kg in stock/);

      // 3. validateStockAvailable with a missing/unlinked item exercises `if (!item) continue;`
      const fakeItemId = new ObjectId().toString();
      const deltas = new Map<string, number>([[fakeItemId, 3.5]]);
      await expect(BillsService['validateStockAvailable'](scope, deltas)).resolves.not.toThrow();

      // 4. validateStockAvailable with item having null unit
      const nullUnitItem = new ObjectId();
      await db.collection('inventory_items').insertOne({
        _id: nullUnitItem,
        company_id: companyId,
        name: 'Null Unit Item',
        unit: null,
        sku: 'SKU-NULL-UNIT',
        quantity: 1.0,
        type: 'finished',
        created_at: new Date(),
      });
      const deltasNull = new Map<string, number>([[nullUnitItem.toString(), 2.0]]);
      await expect(BillsService['validateStockAvailable'](scope, deltasNull)).rejects.toThrow(
        /requested 2.0 pcs, only 1.0 pcs in stock/
      );

      // 5. applyStockDeductions race condition where item is missing during conditional deduction
      const spyStockDeduct = vi.spyOn(BillsRepository, 'adjustInventoryStockConditional').mockResolvedValueOnce(false);
      await expect(
        BillsService['applyStockDeductions'](scope, new Map([[fakeItemId, 2.0]]))
      ).rejects.toThrow(/Insufficient stock: Item: requested 2.0 pcs, only 0.0 pcs in stock/);
      spyStockDeduct.mockRestore();
    });

    it('covers createBill stock deduction rollback on repository failure', async () => {
      const item = await InventoryService.createItem(scope, 'finished', {
        name: 'Rollback Item',
        quantity: 10,
        selling_price: 50,
      });

      // Spy insertBillWithRetry to throw simulated failure
      const spy = vi.spyOn(BillsRepository, 'insertBillWithRetry').mockRejectedValueOnce(new Error('Simulated DB Crash'));

      await expect(
        BillsService.createBill(scope, 'kacha', {
          buyer: { name: 'Crash Buyer' },
          products: [{ name: 'Rollback Item', quantity: 4, rate: 50, inventory_item_id: item.id }],
        })
      ).rejects.toThrow('Simulated DB Crash');

      // Verify stock was restored back to 10
      const current = await InventoryRepository.findItemById(scope, item.id);
      expect(current?.quantity).toBe(10);
      spy.mockRestore();
    });

    it('covers updateBill partial updates, net delta rollback, and appliedIncreases rollback on subsequent failure', async () => {
      const itemA = await InventoryService.createItem(scope, 'finished', { name: 'Item A', quantity: 20, selling_price: 10 });
      const itemB = await InventoryService.createItem(scope, 'finished', { name: 'Item B', quantity: 20, selling_price: 10 });

      const bill = await BillsService.createBill(scope, 'kacha', {
        buyer: { name: 'Update Buyer' },
        products: [
          { name: 'Item A', quantity: 10, rate: 10, inventory_item_id: itemA.id },
          { name: 'Item B', quantity: 5, rate: 10, inventory_item_id: itemB.id },
        ],
        discount: 15,
        gst_percentage: 5,
      });

      // Partial update without products, without discount, without gst_percentage (kacha gst is 0)
      const updatedPartial = await BillsService.updateBill(scope, bill.id, {
        buyer_name: 'Renamed Buyer',
      });
      expect(updatedPartial.discount).toBe(15);
      expect(updatedPartial.gst_percentage).toBe(0);
      expect(updatedPartial.products.length).toBe(2);

      // 1. Rollback negativeNetDeltas when updateBill fails (lines 463-465)
      const spyUpdate = vi.spyOn(BillsRepository, 'updateBill').mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        BillsService.updateBill(scope, bill.id, {
          products: [
            { name: 'Item A', quantity: 4, rate: 10, inventory_item_id: itemA.id },
            { name: 'Item B', quantity: 8, rate: 10, inventory_item_id: itemB.id },
          ],
        })
      ).rejects.toThrow('Update failed');

      spyUpdate.mockRestore();

      // 2. Rollback appliedIncreases when second increase deduction fails (lines 427-429)
      const inc1 = await InventoryService.createItem(scope, 'finished', { name: 'Inc 1', quantity: 20, selling_price: 10 });
      const inc2 = await InventoryService.createItem(scope, 'finished', { name: 'Inc 2', quantity: 20, selling_price: 10 });
      const billMulti = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        buyer: { name: 'Multi Inc Buyer' },
        products: [
          { name: 'Inc 1', quantity: 2, rate: 10, inventory_item_id: inc1.id },
          { name: 'Inc 2', quantity: 2, rate: 10, inventory_item_id: inc2.id },
        ],
      });

      let deductionCount = 0;
      const origAdjustCond = BillsRepository.adjustInventoryStockConditional.bind(BillsRepository);
      const spyMultiDeduct = vi.spyOn(BillsRepository, 'adjustInventoryStockConditional').mockImplementation(async (...args) => {
        deductionCount++;
        if (deductionCount === 1) {
          return origAdjustCond(...args);
        }
        return false; // Second item fails conditional deduction
      });

      await expect(
        BillsService.updateBill(scope, billMulti.id, {
          products: [
            { name: 'Inc 1', quantity: 6, rate: 10, inventory_item_id: inc1.id },
            { name: 'Inc 2', quantity: 6, rate: 10, inventory_item_id: inc2.id },
          ],
        })
      ).rejects.toThrow(/Insufficient stock/);

      spyMultiDeduct.mockRestore();

      // 3. Pakka bill update with gst_number (lines 437-442)
      const pakkaSeed = await BillsService.createBill(scope, 'kacha', {
        buyer: { name: 'Buyer Pakka Update', gst_number: '29ABCDE1234F1Z5' },
        products: [{ name: 'Pakka Product', quantity: 1, rate: 100 }],
      });
      const pakkaConverted = await BillsService.convertToPakka(scope, pakkaSeed.id, {
        gst_number: '29ABCDE1234F1Z5',
        gst_percentage: 18,
      });

      const updatedPakkaGst = await BillsService.updateBill(scope, pakkaConverted.id, {
        gst_number: '29XXXXX9999F1Z9',
      });
      expect(updatedPakkaGst.buyer.gst_number).toBe('29XXXXX9999F1Z9');
    });

    it('covers deleteBill validation and convertToPakka error paths', async () => {
      // 1. Delete bill validation errors
      await expect(BillsService.deleteBill(scope, 'invalid-oid')).rejects.toThrow('Invalid bill id.');
      await expect(BillsService.deleteBill(scope, new ObjectId().toString())).rejects.toThrow('Bill not found.');

      // Create a bill with empty products directly in DB
      const emptyBillId = new ObjectId();
      await db.collection('bills').insertOne({
        _id: emptyBillId,
        company_id: companyId,
        bill_number: 'EMPTY-001',
        bill_type: 'kacha',
        buyer: { name: 'Empty Buyer' },
        products: [],
        created_at: new Date(),
      });
      await expect(BillsService.deleteBill(scope, emptyBillId.toString())).resolves.not.toThrow();

      // 2. convertToPakka keeping existing bill products (data.products omitted)
      const kachaBill = await BillsService.createBill(scope, 'kacha', {
        buyer: { name: 'Kacha To Convert' },
        products: [{ name: 'Manual Product', quantity: 1, rate: 100 }],
      });
      const converted = await BillsService.convertToPakka(scope, kachaBill.id, {
        gst_number: '29ABCDE1234F1Z5',
        gst_percentage: 18,
      });
      expect(converted.bill_type).toBe('pakka');
      expect(converted.gst_percentage).toBe(18);

      // 3. convertToPakka when adjustInventoryStockConditional returns false (lines 532-533)
      const invItem = await InventoryService.createItem(scope, 'finished', {
        name: 'Stock Race Item',
        quantity: 5,
        selling_price: 100,
      });
      const kachaWithStock = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        buyer: { name: 'Race Buyer' },
        products: [{ name: 'Stock Race Item', quantity: 2, rate: 100, inventory_item_id: invItem.id }],
      });
      const spyStock = vi.spyOn(BillsRepository, 'adjustInventoryStockConditional').mockResolvedValueOnce(false);
      await expect(
        BillsService.convertToPakka(scope, kachaWithStock.id, {
          gst_number: '29ABCDE1234F1Z5',
          products: [{ name: 'Stock Race Item', quantity: 4, rate: 100, inventory_item_id: invItem.id }],
        })
      ).rejects.toThrow('Insufficient stock during conversion.');
      spyStock.mockRestore();

      // 4. convertToPakka duplicate key retry and exhaustion (lines 560-568)
      const kachaForRetry = await BillsService.createBill(scope, 'kacha', {
        buyer: { name: 'Retry Pakka Buyer' },
        products: [{ name: 'Manual Product', quantity: 1, rate: 100 }],
      });

      // 4a. Duplicate key error on first attempt, then success on second attempt
      let attemptCount = 0;
      const originalUpdateBill = BillsRepository.updateBill.bind(BillsRepository);
      const spyDupOnce = vi.spyOn(BillsRepository, 'updateBill').mockImplementation(async (...args) => {
        attemptCount++;
        if (attemptCount === 1) {
          const dupErr: any = new Error('E11000 duplicate key error');
          dupErr.code = 11000;
          throw dupErr;
        }
        return originalUpdateBill(...args);
      });
      const retryResult = await BillsService.convertToPakka(scope, kachaForRetry.id, {
        gst_number: '29ABCDE1234F1Z5',
      });
      expect(retryResult.bill_type).toBe('pakka');
      expect(attemptCount).toBe(2);
      spyDupOnce.mockRestore();

      // 4b. Duplicate key error on all 5 attempts -> throws ValidationError
      const kachaForExhaust = await BillsService.createBill(scope, 'kacha', {
        buyer: { name: 'Exhaust Buyer' },
        products: [{ name: 'Manual Product', quantity: 1, rate: 100 }],
      });
      const spyDupAll = vi.spyOn(BillsRepository, 'updateBill').mockImplementation(async () => {
        const dupErr: any = new Error('E11000 duplicate key error');
        dupErr.code = 11000;
        throw dupErr;
      });
      await expect(
        BillsService.convertToPakka(scope, kachaForExhaust.id, {
          gst_number: '29ABCDE1234F1Z5',
        })
      ).rejects.toThrow('Could not generate a unique invoice number, please retry.');
      spyDupAll.mockRestore();

      // 4c. Non-duplicate key error in convertToPakka -> rethrows
      const spyGenericErr = vi.spyOn(BillsRepository, 'updateBill').mockRejectedValueOnce(new Error('Disk failure'));
      await expect(
        BillsService.convertToPakka(scope, kachaForExhaust.id, {
          gst_number: '29ABCDE1234F1Z5',
        })
      ).rejects.toThrow('Disk failure');
      spyGenericErr.mockRestore();

      // 4d. updateBill returns null -> throws NotFoundError('Bill not found.')
      const spyUpdateNull = vi.spyOn(BillsRepository, 'updateBill').mockResolvedValueOnce(null);
      await expect(
        BillsService.convertToPakka(scope, kachaForExhaust.id, {
          gst_number: '29ABCDE1234F1Z5',
        })
      ).rejects.toThrow('Bill not found.');
      spyUpdateNull.mockRestore();
    });

    it('covers recordPayment, profit preview, costs, shipment and delivery edge cases', async () => {
      const bill = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        buyer: { name: 'Payment Buyer' },
        products: [{ name: 'Product', quantity: 1, rate: 500 }],
      });

      // 1. recordPayment with negative/zero amount throws validation error
      await expect(
        BillsService.recordPayment(scope, bill.id, { amount: 0, notes: 'Zero pay' })
      ).rejects.toThrow('Payment amount must be positive.');

      // Valid payment with omitted date
      const p1 = await BillsService.recordPayment(scope, bill.id, { amount: 50, notes: 'Part pay' });
      expect(p1.payments.length).toBe(1);

      // recordPayment where updateBillRaw returns null (concurrent deletion)
      const spyUpdateNull = vi.spyOn(BillsRepository, 'updateBillRaw').mockResolvedValueOnce(null);
      await expect(BillsService.recordPayment(scope, bill.id, { amount: 50 })).rejects.toThrow('Bill not found.');
      spyUpdateNull.mockRestore();

      // 2. getProfitPreview with unlinked product and an item deleted after bill creation
      const tempItem = await InventoryService.createItem(scope, 'finished', {
        name: 'Deleted Later Item',
        quantity: 5,
        selling_price: 300,
        cost_price: 150,
      });
      const unlinkedBill = await BillsService.createBill(scope, 'kacha', {
        workflow: 'legacy' as any,
        buyer: { name: 'Unlinked Buyer' },
        products: [
          { name: 'No Item ID', quantity: 2, rate: 200 },
          { name: 'Deleted Item ID', quantity: 1, rate: 300, inventory_item_id: tempItem.id },
        ],
      });
      await db.collection('inventory_items').deleteOne({ _id: new ObjectId(tempItem.id) });

      const preview = await BillsService.getProfitPreview(scope, unlinkedBill.id);
      expect(preview.lines.length).toBe(2);
      expect(preview.lines[0].unit_cost).toBeNull();
      expect(preview.lines[1].unit_cost).toBeNull();

      // 3. confirmProfit with override vs default
      const pWithOverride = await BillsService.confirmProfit(scope, bill.id, 250);
      expect(pWithOverride.profit_confirmed).toBe(true);
      expect(pWithOverride.profit_confirmed_amount).toBe(250);

      const pReopened = await BillsService.reopenProfit(scope, bill.id);
      expect(pReopened.profit_confirmed).toBe(false);
      expect(pReopened.profit_confirmed_amount).toBeNull();

      const pWithoutOverride = await BillsService.confirmProfit(scope, bill.id);
      expect(pWithoutOverride.profit_confirmed).toBe(true);

      // confirmProfit & reopenProfit null update handling
      const spyProfitNull = vi.spyOn(BillsRepository, 'updateBill').mockResolvedValueOnce(null);
      await expect(BillsService.confirmProfit(scope, bill.id)).rejects.toThrow('Bill not found.');
      spyProfitNull.mockRestore();

      const spyReopenNull = vi.spyOn(BillsRepository, 'updateBill').mockResolvedValueOnce(null);
      await expect(BillsService.reopenProfit(scope, bill.id)).rejects.toThrow('Bill not found.');
      spyReopenNull.mockRestore();

      // 4. Transportation and misc costs validation and defaults
      await expect(
        BillsService.addTransportationCost(scope, bill.id, { amount: 0, notes: 'Zero' })
      ).rejects.toThrow('Amount must be positive.');
      const tCost = await BillsService.addTransportationCost(scope, bill.id, { amount: 35 });
      expect(tCost.transportation_costs.length).toBe(1);

      const spyTNull = vi.spyOn(BillsRepository, 'updateBillRaw').mockResolvedValueOnce(null);
      await expect(BillsService.addTransportationCost(scope, bill.id, { amount: 10 })).rejects.toThrow('Bill not found.');
      spyTNull.mockRestore();

      await expect(
        BillsService.addMiscCost(scope, bill.id, { amount: -5, notes: 'Negative' })
      ).rejects.toThrow('Amount must be positive.');
      const mCost = await BillsService.addMiscCost(scope, bill.id, { amount: 20 });
      expect(mCost.misc_costs.length).toBe(1);

      const spyMNull = vi.spyOn(BillsRepository, 'updateBillRaw').mockResolvedValueOnce(null);
      await expect(BillsService.addMiscCost(scope, bill.id, { amount: 10 })).rejects.toThrow('Bill not found.');
      spyMNull.mockRestore();

      // 5. createShipment validation branches
      await expect(
        BillsService.createShipment(scope, 'invalid-id', { items: [] })
      ).rejects.toThrow('Invalid bill id.');

      await expect(
        BillsService.createShipment(scope, new ObjectId().toString(), { items: [] })
      ).rejects.toThrow('Bill not found.');

      await expect(
        BillsService.createShipment(scope, bill.id, { items: [] })
      ).rejects.toThrow('No items specified to ship.');

      await expect(
        BillsService.createShipment(scope, bill.id, { items: [{ product_name: 'Non Existent', quantity: 1 }] })
      ).rejects.toThrow('Product "Non Existent" is not part of this order.');

      await expect(
        BillsService.createShipment(scope, bill.id, { items: [{ product_name: 'Product', quantity: 0 }] })
      ).rejects.toThrow('Quantity for "Product" must be a positive integer.');

      await expect(
        BillsService.createShipment(scope, bill.id, { items: [{ product_name: 'Product', quantity: 5 }] })
      ).rejects.toThrow('Cannot ship 5 of "Product": only 0 ready to ship.');

      await expect(
        BillsService.createShipment(scope, bill.id, { ship_all: true })
      ).rejects.toThrow('No products are ready to ship.');

      // 6. createShipment success flow
      const shipWorker = await WorkersService.createWorker(scope, { name: 'Shipment Worker' });
      const rawShip = await InventoryRepository.insertItem(scope, {
        name: 'Ship Raw',
        unit: 'pcs',
        type: 'raw',
        quantity: 10,
        cost_price: 10,
        sku: 'SKU-SHIP-RAW-' + Date.now(),
        created_at: new Date(),
      });
      const shipAssign = await WorkersService.createMaterial(scope, shipWorker.id, {
        bill_id: bill.id,
        raw_item_id: rawShip._id.toString(),
        material_name: 'Product',
        quantity: 1,
        price_per_unit: 10,
      });
      await WorkersService.addBatch(scope, shipAssign.id, { quantity: 1 });

      const shipped = await BillsService.createShipment(scope, bill.id, {
        items: [{ product_name: 'Product', quantity: 1 }],
      });
      expect(shipped.shipments.length).toBe(1);

      // 7. PDF and WhatsApp sharing methods
      const pdf = await BillsService.getBillPdf(scope, bill.id);
      expect(pdf.pdf).toBeInstanceOf(Buffer);
      expect(pdf.filename).toMatch(/\.pdf$/);

      await expect(BillsService.shareWhatsApp(scope, bill.id, '+919876543210')).rejects.toThrow(
        /OpenWA is not configured/
      );

      // 8. listBills with pakka, kacha and all
      const listP = await BillsService.listBills(scope, 'pakka');
      expect(Array.isArray(listP)).toBe(true);
      const listK = await BillsService.listBills(scope, 'kacha');
      expect(Array.isArray(listK)).toBe(true);
      const listAll = await BillsService.listBills(scope);
      expect(Array.isArray(listAll)).toBe(true);
    });

    it('covers getBillAssignments and worker pay calculation fallbacks', async () => {
      // Create bill and raw item first
      const bill = await BillsService.createBill(scope, 'kacha', {
        buyer: { name: 'Assignment Buyer' },
        products: [{ name: 'Timber Board', quantity: 10, rate: 100 }],
      });
      const rawTimber = await InventoryRepository.insertItem(scope, {
        name: 'Timber Raw',
        unit: 'pcs',
        type: 'raw',
        quantity: 50,
        cost_price: 10,
        sku: 'SKU-TIMBER-' + Date.now(),
        created_at: new Date(),
      });
      const worker = await WorkersService.createWorker(scope, { name: 'Batch Worker' });
      const assign = await WorkersService.createMaterial(scope, worker.id, {
        bill_id: bill.id,
        raw_item_id: rawTimber._id.toString(),
        material_name: 'Timber Board',
        quantity: 10,
        price_per_unit: 20,
      });

      // Update batches directly in mongo to test over_returned calculation
      await db.collection('material_assignments').updateOne(
        { _id: new ObjectId(assign.id) },
        {
          $set: {
            bill_id: bill.id,
            status: 'completed',
            wage_amount: 150,
            wastage_quantity: 1.5,
            batches: [
              { quantity: 3.5, notes: 'Fractional batch' },
              { quantity: 8.5, notes: 'Over returned batch' },
            ],
          },
        }
      );

      const billAssignments = await BillsService.getBillAssignments(scope, bill.id);
      expect(billAssignments.length).toBe(1);
      expect(billAssignments[0].batches.length).toBe(2);
      expect(billAssignments[0].over_returned).toBe(true);
      expect(billAssignments[0].wastage_quantity).toBe(1.5);
      expect(billAssignments[0].wage_amount).toBe(150);

      // Check worker cost total calculation in serializeBill
      const fetchedBill = await BillsService.getBill(scope, bill.id);
      expect(fetchedBill.id).toBe(bill.id);

      // Unlink assignment (bill_id: null)
      await db.collection('material_assignments').updateOne(
        { _id: new ObjectId(assign.id) },
        { $set: { bill_id: null } }
      );
      const unlinked = await BillsService.getBillAssignments(scope, bill.id);
      expect(unlinked.length).toBe(0);
    });
  });

  describe('2. WorkersService & WorkersRepository Deep Branch Coverage', () => {
    it('covers WorkersRepository string id conversion and null material name search', async () => {
      const nonOid = 'not-an-oid-1234';
      const mats = await WorkersRepository.findAssignmentsByWorker(scope, nonOid);
      expect(mats).toEqual([]);

      await expect(WorkersRepository.deleteAssignmentsByWorker(scope, nonOid)).resolves.not.toThrow();

      const pays = await WorkersRepository.findPaymentsByWorker(scope, nonOid);
      expect(pays).toEqual([]);

      await expect(WorkersRepository.deletePaymentsByWorker(scope, nonOid)).resolves.not.toThrow();
    });

    it('covers WorkersService fallbacks, wage wastage, updateWorker fields, and listWorkers wastage', async () => {
      const worker = await WorkersService.createWorker(scope, {
        name: 'Branch Worker',
        age: '25',
        address: '100 Industrial Lane',
        phone: '+919876543210',
        joining_date: '2026-01-01T00:00:00.000Z',
      });
      expect(worker.age).toBe(25);

      // Update with invalid age string -> age becomes null, and update remaining fields
      const updated = await WorkersService.updateWorker(scope, worker.id, {
        name: 'Updated Worker Name',
        age: 'invalid_number' as any,
        address: '200 Factory Road',
        phone: '+919112233445',
        image_url: 'https://example.com/photo.jpg',
        is_active: false,
        joining_date: '2026-02-01T00:00:00.000Z',
      });
      expect(updated.age).toBeNull();
      expect(updated.is_active).toBe(false);

      // Material assignment with wastage to trigger listWorkers wastageRate > 0
      await WorkersService.updateWorker(scope, worker.id, { is_active: true });
      const rawComp = await InventoryRepository.insertItem(scope, {
        name: 'Component Raw',
        unit: 'pcs',
        type: 'raw',
        quantity: 50,
        cost_price: 5,
        sku: 'SKU-COMP-' + Date.now(),
        created_at: new Date(),
      });
      const compBill = await BillsService.createBill(scope, 'kacha', {
        buyer_name: 'Comp Buyer',
        products: [{ name: 'Component A', quantity: 10, rate: 20 }],
      });
      const assign = await WorkersService.createMaterial(scope, worker.id, {
        bill_id: compBill.id,
        raw_item_id: rawComp._id.toString(),
        material_name: 'Component A',
        quantity: 10,
        price_per_unit: 10,
      });

      await WorkersService.addBatch(scope, assign.id, { quantity: 8 });
      await WorkersService.completeAssignment(scope, assign.id, { raw_returned_quantity: 0 }); // 2 units wasted (10 - 8 = 2)

      const detail = await WorkersService.getWorker(scope, worker.id);
      expect(detail.id).toBe(worker.id);

      const allWorkers = await WorkersService.listWorkers(scope);
      const found = allWorkers.find((w) => w.id === worker.id);
      expect(found?.wastage_rate).toBeGreaterThan(0);
    });
  });

  describe('3. AuthService Deep Branch Coverage', () => {
    it('covers duplicate email conflict and legacy string company_id fallback', async () => {
      const email = `dup-${Date.now()}@test.com`;
      await AuthService.signup({
        email,
        password: 'Password123!',
        name: 'First User',
        company_name: 'First Corp',
      });

      // Duplicate signup throws AppError
      await expect(
        AuthService.signup({
          email,
          password: 'Password123!',
          name: 'Duplicate User',
          company_name: 'Second Corp',
        })
      ).rejects.toThrow('Email already registered.');

      // User with legacy string company and null name
      const legacyEmail = `legacy-${Date.now()}@test.com`;
      const legacyOid = new ObjectId();
      await db.collection('user').insertOne({
        _id: legacyOid,
        email: legacyEmail,
        name: null, // tests user.name ?? ''
        password: hashPassword('LegacyPassword123!'),
        company: 'legacy-string-company-id',
        company_id: 'legacy-string-company-id',
        created_at: new Date(),
      });

      const authLogin = await AuthService.login({
        email: legacyEmail,
        password: 'LegacyPassword123!',
      });
      expect(authLogin.user.company_id).toBe('legacy-string-company-id');
      expect(authLogin.user.name).toBe('');
    });

    it('covers googleLogin error paths and id_token parameter fallback', async () => {
      // 1. Missing credentials
      await expect(AuthService.googleLogin({} as any)).rejects.toThrow('Missing Google credential.');

      // 2. Network error on tokeninfo fetch
      const spyFetchErr = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));
      await expect(AuthService.googleLogin({ credential: 'dummy-token' })).rejects.toThrow(
        'Could not verify Google credential.'
      );
      spyFetchErr.mockRestore();

      // 3. Google credential with mismatched audience
      const spyFetchBadAud = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          aud: 'wrong-client-id',
          email: 'wrong@example.com',
          email_verified: true,
        }),
      } as any);
      await expect(AuthService.googleLogin({ credential: 'dummy-token' })).rejects.toThrow(
        'Google credential was not issued for this application.'
      );
      spyFetchBadAud.mockRestore();

      // 4. Valid google token via id_token input parameter creating a new user
      const gEmail = `google-${Date.now()}@test.com`;
      const expectedAud = env.GOOGLE_CLIENT_ID || 'mock-google-client-id';
      const spyFetchOk = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          aud: expectedAud,
          email: gEmail,
          email_verified: 'true',
          name: 'Google Person',
          sub: 'google-sub-456',
        }),
      } as any);

      const gLogin = await AuthService.googleLogin({ id_token: 'valid-id-token' });
      expect(gLogin.user.email).toBe(gEmail);
      expect(gLogin.user.name).toBe('Google Person');

      // 5. Subsequent login with existing google user
      const gRepeat = await AuthService.googleLogin({ credential: 'valid-id-token' });
      expect(gRepeat.user.email).toBe(gEmail);

      spyFetchOk.mockRestore();

      // 6. Google login race condition (code 11000 duplicate on createUser) with legacy company string
      const raceEmail = `race-google-${Date.now()}@test.com`;
      await db.collection('user').insertOne({
        _id: new ObjectId(),
        email: raceEmail,
        name: 'Race User',
        company: 'legacy-race-company-id',
        created_at: new Date(),
      });
      const spyRaceCreate = vi.spyOn(AuthRepository, 'createUser').mockImplementationOnce(async () => {
        const dup: any = new Error('duplicate key');
        dup.code = 11000;
        throw dup;
      });
      const spyFetchRace = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          aud: expectedAud,
          email: raceEmail,
          email_verified: true,
          name: 'Race User',
        }),
      } as any);

      const raceLogin = await AuthService.googleLogin({ credential: 'dummy-token' });
      expect(raceLogin.user.email).toBe(raceEmail);
      spyRaceCreate.mockRestore();
      spyFetchRace.mockRestore();
    });

    it('covers refresh with null user name, no company login fallback, and signup regex duplicate error', async () => {
      // 1. Refresh with user having null name
      const noNameUserOid = new ObjectId();
      const noNameEmail = `noname-${Date.now()}@test.com`;
      await db.collection('user').insertOne({
        _id: noNameUserOid,
        email: noNameEmail,
        name: null,
        password: hashPassword('Pass123!'),
        created_at: new Date(),
      });
      const refreshTok = generateTokens({ _id: noNameUserOid, email: noNameEmail, name: '' }, 'comp-id').refresh;
      const refreshed = await AuthService.refresh(refreshTok);
      expect(refreshed.access).toBeDefined();

      // 2. Login with user having no company and no company_id (covers companyId = '' line 36)
      const noCompEmail = `nocomp-login-${Date.now()}@test.com`;
      await db.collection('user').insertOne({
        _id: new ObjectId(),
        email: noCompEmail,
        name: 'No Comp User',
        password: hashPassword('Pass123!'),
        company: null,
        company_id: null,
        created_at: new Date(),
      });
      const noCompLogin = await AuthService.login({ email: noCompEmail, password: 'Pass123!' });
      expect(noCompLogin.user.company_id).toBe('');
      expect(noCompLogin.user.company_name).toBe('My Company');

      // 3. Signup where createUser throws error with message containing 'duplicate key' without code 11000
      const spyCreateUser = vi.spyOn(AuthRepository, 'createUser').mockRejectedValueOnce(
        new Error('E11000 duplicate key error on index email')
      );
      await expect(
        AuthService.signup({
          email: `regex-dup-${Date.now()}@test.com`,
          password: 'Password123!',
          name: 'Regex Dup',
          company_name: 'Regex Corp',
        })
      ).rejects.toThrow('Email already registered.');
      spyCreateUser.mockRestore();
    });
  });

  describe('4. InventoryService Deep Branch Coverage', () => {
    it('covers item and warehouse default fallbacks and not found updates', async () => {
      // 1. Item without unit and sku
      const itemOid = new ObjectId();
      await db.collection('inventory_items').insertOne({
        _id: itemOid,
        company_id: companyId,
        name: 'Default Props Item',
        type: 'raw',
        selling_price: 10,
        cost_price: 5,
        created_at: new Date(),
      });

      const items = await InventoryService.listItems(scope, 'raw');
      const foundItem = items.find((i) => i.id === itemOid.toString());
      expect(foundItem?.unit).toBe('pcs');
      expect(foundItem?.sku).toBe('');

      // 2. Warehouse without location
      const whOid = new ObjectId();
      await db.collection('warehouses').insertOne({
        _id: whOid,
        company_id: companyId,
        name: 'Default Location WH',
        created_at: new Date(),
      });
      const whList = await InventoryService.listWarehouses(scope);
      const foundWh = whList.find((w) => w.id === whOid.toString());
      expect(foundWh?.location).toBe('');

      // 3. updateItem on non-existent ID throws NotFoundError
      await expect(
        InventoryService.updateItem(scope, 'finished', new ObjectId().toString(), { name: 'Ghost' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('5. WebSocket Gateway & ErrorHandler Deep Branches', () => {
    it('covers gateway upgrade event fallbacks and closeWebSockets', () => {
      const server = http.createServer();
      setupWebSocketGateway(server);

      // Upgrade with undefined host header (falls back to 'localhost')
      const mockSocket1 = { destroy: vi.fn() } as any;
      server.emit('upgrade', { url: '/invalid-path', headers: {} }, mockSocket1, Buffer.from([]));
      expect(mockSocket1.destroy).toHaveBeenCalled();

      // Upgrade with malformed URL
      const mockSocket2 = { destroy: vi.fn() } as any;
      server.emit('upgrade', { url: 'http://', headers: { host: 'localhost' } }, mockSocket2, Buffer.from([]));
      expect(mockSocket2.destroy).toHaveBeenCalled();

      // closeWebSockets cleans up active connections
      expect(() => closeWebSockets(1000, 'Normal shutdown')).not.toThrow();
    });

    it('covers gateway first-message authentication edge cases', async () => {
      const server = http.createServer();
      const wss = setupWebSocketGateway(server);

      const mockWs: any = {
        readyState: WebSocket.OPEN,
        close: vi.fn(),
        send: vi.fn(),
        on: vi.fn(),
      };

      const connListener = wss.listeners('connection')[0];
      if (connListener) {
        connListener(mockWs, { url: '/ws/ai-assistant/', headers: { host: 'localhost' } } as any);

        const msgHandler = mockWs.on.mock.calls.find((c: any) => c[0] === 'message')?.[1];
        if (msgHandler) {
          // 1. Message without token when unauthenticated
          msgHandler(JSON.stringify({ command: 'help' }));
          await new Promise((r) => setTimeout(r, 20));
          expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('Authentication required.'));

          // 2. Message with invalid token
          msgHandler(JSON.stringify({ token: 'invalid.jwt.token' }));
          await new Promise((r) => setTimeout(r, 20));
          expect(mockWs.close).toHaveBeenCalledWith(4001, 'Invalid or expired token');

          // 3. Message with token for a user that has no company in DB
          const noCompOid = new ObjectId();
          const noCompEmail = `nocomp-${Date.now()}@test.com`;
          await db.collection('user').insertOne({
            _id: noCompOid,
            email: noCompEmail,
            name: 'No Comp User',
            company: null,
            company_id: null,
            created_at: new Date(),
          });
          const noCompToken = generateTokens({ _id: noCompOid, email: noCompEmail, name: 'No Comp' }, '').access;
          msgHandler(JSON.stringify({ token: noCompToken }));
          await new Promise((r) => setTimeout(r, 50));
          expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('No company associated with user.'));

          // 4. Message auth for user with string company (line 218)
          const strCompUserOid = new ObjectId();
          const strCompEmail = `strcomp-${Date.now()}@test.com`;
          await db.collection('user').insertOne({
            _id: strCompUserOid,
            email: strCompEmail,
            name: 'Str Comp User',
            company: companyId,
            company_id: companyId,
            created_at: new Date(),
          });
          const strCompToken = generateTokens({ _id: strCompUserOid, email: strCompEmail, name: 'Str Comp' }, companyId).access;
          msgHandler(JSON.stringify({ token: strCompToken }));
          await new Promise((r) => setTimeout(r, 50));
        }
      }

      // 5. Connection with query param token for user without company (lines 173-176)
      const mockWsNoComp: any = { close: vi.fn(), send: vi.fn(), on: vi.fn(), readyState: WebSocket.OPEN };
      const noCompEmail2 = `nocomp2-${Date.now()}@test.com`;
      await db.collection('user').insertOne({
        _id: new ObjectId(),
        email: noCompEmail2,
        name: 'No Comp 2',
        company: null,
        company_id: null,
        created_at: new Date(),
      });
      const noCompToken2 = generateTokens({ _id: new ObjectId(), email: noCompEmail2, name: 'No Comp 2' }, '').access;
      if (connListener) {
        connListener(mockWsNoComp, {
          url: `/ws/ai-assistant/?token=${noCompToken2}`,
          headers: { host: 'localhost' },
        } as any);
        await new Promise((r) => setTimeout(r, 50));
        expect(mockWsNoComp.close).toHaveBeenCalledWith(4001, 'No company associated with user');
      }
    });

    it('covers errorHandler fallback branches (requestId, mongo duplicate keyPattern, primitive errors)', () => {
      let responseStatus = 0;
      let responseBody: any = null;
      const res: any = {
        status: (code: number) => {
          responseStatus = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      };

      // 1. req.requestId fallback when req.id is undefined
      const reqWithRequestId: any = { requestId: 'req-abc-123' };
      errorHandler(new Error('Test generic error'), reqWithRequestId, res, () => {});
      expect(responseStatus).toBe(500);

      // 2. MongoDB duplicate error with keyPattern: { invoice_number: 1 }
      const invDupError: any = new Error('E11000 duplicate key error');
      invDupError.code = 11000;
      invDupError.keyPattern = { invoice_number: 1 };
      errorHandler(invDupError, {} as any, res, () => {});
      expect(responseStatus).toBe(400);
      expect(responseBody.detail).toContain('Invoice number already exists');

      // 3. MongoDB duplicate error with keyPattern: { sku: 1 }
      const skuDupError: any = new Error('E11000 duplicate key error');
      skuDupError.code = 11000;
      skuDupError.keyPattern = { sku: 1 };
      errorHandler(skuDupError, {} as any, res, () => {});
      expect(responseStatus).toBe(400);
      expect(responseBody.detail).toContain('SKU already exists');

      // 4. Non-Error primitive error thrown (string)
      errorHandler('raw string error' as any, {} as any, res, () => {});
      expect(responseStatus).toBe(500);
    });
  });

  describe('6. BillsRepository Invoice Counter Fallback', () => {
    it('handles non-numeric invoice numbers and missing counter sequence gracefully', async () => {
      // Insert bill with corrupted/alphabetic invoice number
      await db.collection('bills').insertOne({
        _id: new ObjectId(),
        company_id: companyId,
        invoice_number: 'INV-2026-INVALID',
        created_at: new Date(),
      });

      // Generate invoice number should still produce a valid invoice number monotonically
      const invNum = await BillsRepository.getNextInvoiceNumber(scope, false);
      expect(invNum).toMatch(/^INV-2026-\d{5}$/);

      // Force resync counter
      const invNumResync = await BillsRepository.getNextInvoiceNumber(scope, true);
      expect(invNumResync).toMatch(/^INV-2026-\d{5}$/);
    });
  });

  describe('7. BillPdfService Multi-Page Totals and Signatory Footers', () => {
    it('renders multi-page PDF when line items push totals block and footer past 780pt', async () => {
      // Create a bill doc with 26 products to exceed 780pt boundary
      const products = Array.from({ length: 26 }, (_, i) => ({
        name: `Product Batch Item ${i + 1}`,
        quantity: 5,
        rate: 100,
        amount: 500,
      }));

      const multiPageBill: any = {
        _id: new ObjectId(),
        company_id: companyId,
        bill_number: 'MULTI-PDF-001',
        bill_type: 'pakka',
        invoice_number: 'INV-2026-99999',
        buyer: { name: 'Multi Page Customer', gst_number: '29ABCDE1234F1Z5' },
        products,
        subtotal: 13000,
        discount: 500,
        gst_percentage: 18,
        gst_amount: 2250,
        grand_total: 14750,
        created_at: new Date(),
      };

      const company = await db.collection('company').findOne({ company_id: companyId });
      const pdfBuffer = await BillPdfService.renderBillPdf(multiPageBill, company);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(1000);
    });
  });
});
