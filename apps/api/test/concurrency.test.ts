import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { setupTestDb, teardownTestDb, clearDatabase, createTestUser, app } from './testHelper.js';
import { getCollection } from '../src/db/mongo.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';

describe('Concurrency & Race Conditions Suite', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('generates strictly unique, monotonic invoice numbers under high concurrent bill creations', async () => {
    const user = await createTestUser();
    const concurrentRequests = 25;

    const payload = {
      bill_type: 'pakka',
      buyer: {
        name: 'Concurrent Buyer Corp',
        address: '123 Market St',
        gst_number: '29ABCDE1234F1Z5',
        phone: '9876543210',
      },
      products: [
        {
          name: 'Widget Alpha',
          quantity: 2,
          rate: 100,
        },
      ],
      discount: 0,
      gst_percentage: 18,
    };

    // Fire 25 concurrent requests simultaneously
    const responses = await Promise.all(
      Array.from({ length: concurrentRequests }).map(() =>
        request(app)
          .post('/api/v1/bills/')
          .set('Authorization', `Bearer ${user.token}`)
          .send(payload)
      )
    );

    // All requests must succeed
    for (const res of responses) {
      expect(res.status).toBe(201);
      expect(res.body.invoice_number).toBeDefined();
    }

    const invoiceNumbers = responses.map((r) => r.body.invoice_number as string);
    const uniqueInvoiceNumbers = new Set(invoiceNumbers);

    // Assert no duplicate invoice numbers
    expect(uniqueInvoiceNumbers.size).toBe(concurrentRequests);

    // Verify format and consecutive sequence
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const sequences = invoiceNumbers.map((inv) => {
      expect(inv.startsWith(prefix)).toBe(true);
      return parseInt(inv.slice(prefix.length), 10);
    });

    sequences.sort((a, b) => a - b);
    for (let i = 0; i < sequences.length; i++) {
      expect(sequences[i]).toBe(i + 1);
    }
  });

  it('guarantees atomic inventory stock decrement under concurrent operations without lost updates', async () => {
    const user = await createTestUser();
    const itemsCol = getCollection('inventory_items');

    const initialStock = 500;
    const decrementPerOp = 5;
    const concurrentOperations = 40;

    const itemId = new ObjectId();
    await itemsCol.insertOne({
      _id: itemId,
      company_id: user.companyId,
      name: 'High Demand Component',
      category: 'Electronics',
      quantity: initialStock,
      cost_price: 50,
      selling_price: 100,
      reorder_level: 20,
      unit: 'pcs',
      created_at: new Date(),
    });

    const scope = { companyId: user.companyId };

    // Execute 40 parallel atomic decrements
    await Promise.all(
      Array.from({ length: concurrentOperations }).map(() =>
        BillsRepository.adjustInventoryStockById(scope, itemId, -decrementPerOp)
      )
    );

    const updatedItem = await itemsCol.findOne({ _id: itemId });
    expect(updatedItem).toBeDefined();

    const expectedStock = initialStock - concurrentOperations * decrementPerOp; // 500 - 200 = 300
    expect(updatedItem?.quantity).toBe(expectedStock);
  });
});
