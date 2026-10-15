import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestUser, clearDatabase } from './testHelper.js';

describe('Bills Deep Lifecycle, Mutation & Queries Suite', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('creates, updates, lists, and deletes bills across statuses', async () => {
    const user = await createTestUser();

    // 1. Create a bill
    const billData = {
      bill_type: 'pakka',
      buyer: {
        name: 'Alpha Traders',
        address: 'MG Road, Delhi',
        gst_number: '27AAAAA0000A1Z5',
        phone: '9876543210',
      },
      products: [
        {
          name: 'Silk Yarn',
          quantity: 20,
          rate: 150,
        },
      ],
      discount: 0,
      gst_percentage: 5,
    };

    const createRes = await request(app)
      .post('/api/v1/bills')
      .set('Authorization', `Bearer ${user.token}`)
      .send(billData);

    expect(createRes.status).toBe(201);
    const billId = createRes.body.id;
    expect(createRes.body.invoice_number).toBeDefined();

    // 2. Fetch bill by ID
    const getRes = await request(app)
      .get(`/api/v1/bills/${billId}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.buyer.name).toBe('Alpha Traders');

    // 3. Update bill buyer and discount
    const updateRes = await request(app)
      .put(`/api/v1/bills/${billId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        ...billData,
        buyer: {
          ...billData.buyer,
          name: 'Alpha Traders Corp',
        },
        discount: 100,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.buyer.name).toBe('Alpha Traders Corp');
    expect(updateRes.body.discount).toBe(100);

    // 4. List with filter
    const listRes = await request(app)
      .get('/api/v1/bills?type=pakka')
      .set('Authorization', `Bearer ${user.token}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(1);

    // 5. Delete bill
    const deleteRes = await request(app)
      .delete(`/api/v1/bills/${billId}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(deleteRes.status).toBe(204);

    // 6. Verify 404 after deletion
    const getDeletedRes = await request(app)
      .get(`/api/v1/bills/${billId}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(getDeletedRes.status).toBe(404);
  });

  it('rejects invalid or non-existent bill IDs', async () => {
    const user = await createTestUser();

    // Non-existent valid ObjectId -> 404
    const notFoundRes = await request(app)
      .get('/api/v1/bills/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${user.token}`);

    expect(notFoundRes.status).toBe(404);

    // Invalid format ObjectId -> 400
    const badIdRes = await request(app)
      .get('/api/v1/bills/not-a-valid-id')
      .set('Authorization', `Bearer ${user.token}`);

    expect(badIdRes.status).toBe(400);
  });
});
