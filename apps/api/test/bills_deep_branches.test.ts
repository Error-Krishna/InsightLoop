import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { connectMongo, closeMongo } from '../src/db/mongo.js';
import { BillsService } from '../src/modules/bills/bills.service.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import { ValidationError, NotFoundError } from '../src/utils/errors.js';

describe('Bills Deep Branch Exhaustion Suite', () => {
  const companyId = 'bills-deep-' + Date.now();
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
    }
    await closeMongo();
  });

  it('covers stock deltas, pakka updates, conversion with products, and error paths', async () => {
    // 1. Inventory items for deltas
    const item1 = await InventoryService.createItem(scope, 'finished', {
      name: 'Delta Item 1',
      quantity: 50,
      cost_price: 20,
      selling_price: 40,
    });
    const item2 = await InventoryService.createItem(scope, 'finished', {
      name: 'Delta Item 2',
      quantity: 50,
      cost_price: 30,
      selling_price: 60,
    });

    // 2. Create kacha bill with 2 items
    const bill = await BillsService.createBill(scope, 'kacha', {
      buyer: { name: 'Delta Buyer', phone: '9876543210', address: '123 Market', gst_number: '27AAAAA0000A1Z5' },
      products: [
        { name: 'Delta Item 1', quantity: 10, rate: 40, inventory_item_id: item1.id },
        { name: 'Delta Item 2', quantity: 5, rate: 60, inventory_item_id: item2.id },
      ],
      discount: 20,
    });
    expect(bill.grand_total).toBe(680); // (400 + 300) - 20

    // Stock checks: item1 was 50, now 40; item2 was 50, now 45
    let stock1 = await InventoryRepository.findItemById(scope, item1.id);
    let stock2 = await InventoryRepository.findItemById(scope, item2.id);
    expect(stock1?.quantity).toBe(40);
    expect(stock2?.quantity).toBe(45);

    // 3. Update bill: increase item1 quantity to 15 (net delta +5 needed), decrease item2 to 2 (net delta -3 restored)
    const updated = await BillsService.updateBill(scope, bill.id, {
      buyer_name: 'Delta Buyer Updated',
      buyer_address: '456 Market St',
      buyer_phone: '9999988888',
      gst_number: '27AAAAA0000A1Z5',
      products: [
        { name: 'Delta Item 1', quantity: 15, rate: 40, inventory_item_id: item1.id },
        { name: 'Delta Item 2', quantity: 2, rate: 60, inventory_item_id: item2.id },
      ],
      discount: 10,
    });
    expect(updated.grand_total).toBe(710); // (600 + 120) - 10

    stock1 = await InventoryRepository.findItemById(scope, item1.id);
    stock2 = await InventoryRepository.findItemById(scope, item2.id);
    expect(stock1?.quantity).toBe(35); // 40 - 5
    expect(stock2?.quantity).toBe(48); // 45 + 3

    // 4. Update bill with insufficient stock fails and preserves stock
    await expect(
      BillsService.updateBill(scope, bill.id, {
        products: [
          { name: 'Delta Item 1', quantity: 9999, rate: 40, inventory_item_id: item1.id },
        ],
      })
    ).rejects.toThrow('Insufficient stock: Delta Item 1: requested 9984.0 pcs, only 35.0 pcs in stock');

    stock1 = await InventoryRepository.findItemById(scope, item1.id);
    expect(stock1?.quantity).toBe(35);

    // 5. Convert to pakka with new products & stock adjustment
    const pakkaBill = await BillsService.convertToPakka(scope, bill.id, {
      gst_number: '27AAAAA0000A1Z5',
      gst_percentage: 18,
      products: [
        { name: 'Delta Item 1', quantity: 20, rate: 40, inventory_item_id: item1.id }, // +5 more
      ],
    });
    expect(pakkaBill.bill_type).toBe('pakka');
    expect(pakkaBill.gst_percentage).toBe(18);

    stock1 = await InventoryRepository.findItemById(scope, item1.id);
    expect(stock1?.quantity).toBe(30); // 35 - 5

    // 6. Update pakka bill validation
    const pakkaUpdated = await BillsService.updateBill(scope, pakkaBill.id, {
      gst_number: '27BBBBB1111B1Z6',
      gst_percentage: 12,
      discount: 50,
    });
    expect(pakkaUpdated.gst_percentage).toBe(12);

    // 7. Costs without dates and notes
    await BillsService.addTransportationCost(scope, pakkaBill.id, { amount: 100 });
    await BillsService.addMiscCost(scope, pakkaBill.id, { amount: 50 });

    // 8. Ready to deliver without notes and date
    await BillsService.addReadyToDeliver(scope, pakkaBill.id, {
      inventory_item_id: item1.id,
      quantity: 5,
    });

    // 9. Profit preview on bill with zero grand total
    const zeroBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Free Promo', quantity: 1, rate: 0 }],
      discount: 0,
    });
    const zeroPreview = await BillsService.getProfitPreview(scope, zeroBill.id);
    expect(zeroPreview.revenue_collected).toBe(0);
    expect(zeroPreview.payment_fraction).toBe(0);

    // 10. Confirm profit with explicit 0 amount
    const confirmedZero = await BillsService.confirmProfit(scope, zeroBill.id, 0);
    expect(confirmedZero.profit_confirmed_amount).toBe(0);

    // 11. Delete bill restores stock
    await BillsService.deleteBill(scope, pakkaBill.id);
    stock1 = await InventoryRepository.findItemById(scope, item1.id);
    expect(stock1?.quantity).toBe(50); // Fully restored to 50!

    // 12. Convert to pakka with retry simulation on duplicate key (11000)
    const retryBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Retry Item', quantity: 1, rate: 50 }],
    });

    let attemptCount = 0;
    const origUpdateBill = BillsRepository.updateBill;
    BillsRepository.updateBill = async (s: any, id: any, data: any) => {
      attemptCount++;
      if (attemptCount === 1) {
        const err: any = new Error('E11000 duplicate key error');
        err.code = 11000;
        throw err;
      }
      return origUpdateBill.call(BillsRepository, s, id, data);
    };

    try {
      const convertedWithRetry = await BillsService.convertToPakka(scope, retryBill.id, {
        gst_number: '27AAAAA0000A1Z5',
        gst_percentage: 18,
      });
      expect(convertedWithRetry.bill_type).toBe('pakka');
      expect(attemptCount).toBe(2);
    } finally {
      BillsRepository.updateBill = origUpdateBill;
    }

    // 13. Convert to pakka fails after 4 duplicate key attempts
    const failRetryBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Fail Retry Item', quantity: 1, rate: 50 }],
    });
    BillsRepository.updateBill = async () => {
      const err: any = new Error('E11000 duplicate key error');
      err.code = 11000;
      throw err;
    };
    try {
      await expect(
        BillsService.convertToPakka(scope, failRetryBill.id, {
          gst_number: '27AAAAA0000A1Z5',
          gst_percentage: 18,
        })
      ).rejects.toThrow('Could not generate a unique invoice number, please retry.');
    } finally {
      BillsRepository.updateBill = origUpdateBill;
    }

    // 14. Over-received payment (paying more than grand total)
    const overBill = await BillsService.createBill(scope, 'kacha', {
      products: [{ name: 'Overpay Item', quantity: 2, rate: 100 }],
    });
    const overPaid = await BillsService.recordPayment(scope, overBill.id, { amount: 300 });
    expect(overPaid.over_received).toBe(true);
    expect(overPaid.balance_due).toBe(0);
    expect(overPaid.payment_status).toBe('paid');
  });
});
