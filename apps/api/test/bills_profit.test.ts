import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';

describe('Bills Lifecycle, State Machine & Profit Transitions Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('manages complete bill lifecycle from creation through partial payment, full payment, and profit confirmation', async () => {
    const user = await createTestUser();

    // 1. Create a kacha bill
    const createRes = await request(app)
      .post('/api/v1/bills/')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        bill_type: 'kacha',
        buyer: {
          name: 'Acme Traders',
          phone: '9988776655',
        },
        products: [
          {
            name: 'Standard Cotton Shirts',
            quantity: 10,
            rate: 200,
          },
        ],
        discount: 100, // Grand total = 10 * 200 - 100 = 1900
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.grand_total).toBe(1900);
    expect(createRes.body.balance_due).toBe(1900);
    expect(createRes.body.payment_status).toBe('unpaid');
    expect(createRes.body.order_status).toBe('confirmed');
    expect(createRes.body.profit_confirmed).toBe(false);

    const billId = createRes.body.id as string;

    // 2. Record partial payment of 1000
    const partialPayRes = await request(app)
      .post(`/api/v1/bills/${billId}/record-payment`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        amount: 1000,
        notes: 'Advance UPI payment',
      });

    expect(partialPayRes.status).toBe(201);
    expect(partialPayRes.body.amount_received).toBe(1000);
    expect(partialPayRes.body.balance_due).toBe(900);
    expect(partialPayRes.body.payment_status).toBe('partial');
    expect(partialPayRes.body.order_status).toBe('confirmed');

    // 3. Record remaining payment of 900
    const fullPayRes = await request(app)
      .post(`/api/v1/bills/${billId}/record-payment`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        amount: 900,
        notes: 'Final settlement in cash',
      });

    expect(fullPayRes.status).toBe(201);
    expect(fullPayRes.body.amount_received).toBe(1900);
    expect(fullPayRes.body.balance_due).toBe(0);
    expect(fullPayRes.body.payment_status).toBe('paid');
    expect(fullPayRes.body.order_status).toBe('confirmed');

    // 4. Add transportation cost
    const transRes = await request(app)
      .post(`/api/v1/bills/${billId}/transportation-cost`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        amount: 150,
        notes: 'Courier delivery charge',
      });

    expect(transRes.status).toBe(201);
    expect(transRes.body.transportation_cost_total).toBe(150);

    // 5. Add misc cost
    const miscRes = await request(app)
      .post(`/api/v1/bills/${billId}/misc-cost`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        amount: 50,
        notes: 'Packaging supplies',
      });

    expect(miscRes.status).toBe(201);
    expect(miscRes.body.misc_cost_total).toBe(50);

    // 6. Complete production and shipment to fulfill the order
    const rawRes = await request(app)
      .post('/api/v1/inventory/raw')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Cotton Fabric',
        unit: 'm',
        quantity: 50,
        cost_price: 10,
        selling_price: 20,
      });
    expect(rawRes.status).toBe(201);
    const rawItemId = rawRes.body.id as string;

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        name: 'Suresh Tailor',
        phone: '9876543210',
      });
    expect(workerRes.status).toBe(201);
    const workerId = workerRes.body.id as string;

    const assignRes = await request(app)
      .post(`/api/v1/workers/${workerId}/materials`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        bill_id: billId,
        material_name: 'Standard Cotton Shirts',
        quantity: 10,
        raw_item_id: rawItemId,
        raw_per_unit: 1,
        wage_amount: 100,
      });
    expect(assignRes.status).toBe(201);
    const assignmentId = assignRes.body.id as string;

    const batchRes = await request(app)
      .post(`/api/v1/workers/materials/${assignmentId}/batches`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        quantity: 10,
      });
    expect(batchRes.status).toBe(201);

    const completeRes = await request(app)
      .put(`/api/v1/workers/materials/${assignmentId}/complete`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ raw_returned_quantity: 0 });
    expect(completeRes.status).toBe(200);

    const shipRes = await request(app)
      .post(`/api/v1/bills/${billId}/shipments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ ship_all: true });
    expect(shipRes.status).toBe(201);
    expect(shipRes.body.order_status).toBe('closed');

    // 7. Query Profit Preview
    const previewRes = await request(app)
      .get(`/api/v1/bills/${billId}/profit-preview`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.revenue_collected).toBe(1900);
    expect(previewRes.body.cost_breakdown.transportation_cost).toBe(150);
    expect(previewRes.body.cost_breakdown.misc_cost).toBe(50);
    expect(previewRes.body.cost_breakdown.material_cost).toBe(100); // 10 * 10
    expect(previewRes.body.cost_breakdown.worker_cost).toBe(100); // 100 wage
    expect(previewRes.body.cost_basis_full).toBe(400); // 100 mat + 100 worker + 150 trans + 50 misc
    // Suggested profit = 1900 - 400 = 1500
    expect(previewRes.body.suggested_profit).toBe(1500);

    // 8. Confirm profit
    const confirmProfitRes = await request(app)
      .post(`/api/v1/bills/${billId}/confirm-profit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        confirmed_amount: 1500,
      });

    expect(confirmProfitRes.status).toBe(200);
    expect(confirmProfitRes.body.profit_confirmed).toBe(true);
    expect(confirmProfitRes.body.profit_confirmed_amount).toBe(1500);
    expect(confirmProfitRes.body.order_status).toBe('closed');

    // 9. Convert kacha bill to formal pakka bill
    const convertRes = await request(app)
      .post(`/api/v1/bills/${billId}/convert`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        gst_number: '29ABCDE1234F1Z5',
        gst_percentage: 12,
      });

    expect(convertRes.status).toBe(200);
    expect(convertRes.body.bill_type).toBe('pakka');
    expect(convertRes.body.gst_percentage).toBe(12);
    expect(convertRes.body.invoice_number).toBeDefined();
    // 2000 subtotal - 100 discount = 1900 taxable; GST 12% = 228; grand total = 2128
    expect(convertRes.body.gst_amount).toBe(228);
    expect(convertRes.body.grand_total).toBe(2128);
    // Since grand_total is now 2128 and amount paid is 1900, payment is partial and all items remain shipped
    expect(convertRes.body.payment_status).toBe('partial');
    expect(convertRes.body.order_status).toBe('shipped');
  });
});
