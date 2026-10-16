import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../apps/api/src/app.js';
import { setupTestDb, teardownTestDb, createTestUser } from '../apps/api/test/testHelper.js';
import { WorkersService } from '../apps/api/src/modules/workers/workers.service.js';
import { BillsService } from '../apps/api/src/modules/bills/bills.service.js';

interface NegativeFixture {
  id: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  payload: Record<string, unknown>;
  expectedStatus: number;
  expectedErrorSubstring: string;
  useAuth?: boolean;
}

describe('Negative Fixtures Suite (Python-Free Safety Net 4: Schema & Input Rejection)', () => {
  let token: string;
  let fixtures: NegativeFixture[];
  let workerId: string;
  let assignmentId: string;
  let completedAssignmentId: string;
  let kachaBillId: string;
  let pakkaBillId: string;

  beforeAll(async () => {
    await setupTestDb();
    const user = await createTestUser();
    token = user.token;
    const scope = { companyId: user.companyId };

    // 1. Create a worker
    const worker = await WorkersService.createWorker(scope, {
      name: 'Fixture Worker',
      phone: '9876543210',
    });
    workerId = worker.id;

    // 2. Create an open assignment
    const openAssign = await WorkersService.createMaterial(scope, workerId, {
      material_name: 'Raw Cotton',
      quantity: 100,
      price_per_unit: 15,
    });
    assignmentId = openAssign.id;

    // 3. Create a completed assignment
    const toComplete = await WorkersService.createMaterial(scope, workerId, {
      material_name: 'Raw Silk',
      quantity: 50,
      price_per_unit: 25,
    });
    await WorkersService.completeAssignment(scope, toComplete.id);
    completedAssignmentId = toComplete.id;

    // 4. Create a kacha bill (without ready-to-deliver batches)
    const kacha = await BillsService.createBill(scope, 'kacha', {
      buyer: { name: 'Kacha Buyer' },
      products: [{ name: 'Fabric', quantity: 10, rate: 100 }],
    });
    kachaBillId = kacha.id;

    // 5. Create a pakka bill
    const pakka = await BillsService.createBill(scope, 'pakka', {
      buyer: { name: 'Pakka Buyer', gst_number: '29ABCDE1234F1Z5' },
      products: [{ name: 'Linen', quantity: 5, rate: 200 }],
    });
    pakkaBillId = pakka.id;

    const fixturesDir = path.resolve(__dirname, '../fixtures/negative');
    const indexPath = path.join(fixturesDir, 'index.json');
    expect(fs.existsSync(indexPath)).toBe(true);

    fixtures = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('loads at least 20 negative test fixtures from disk', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
  });

  it('rejects all negative fixtures with matching status codes and error messages', async () => {
    for (const fix of fixtures) {
      let resolvedEndpoint = fix.endpoint
        .replace(':workerId', workerId)
        .replace(':assignmentId', assignmentId)
        .replace(':completedAssignmentId', completedAssignmentId)
        .replace(':kachaBillId', kachaBillId)
        .replace(':pakkaBillId', pakkaBillId);

      let req = request(app)[fix.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](resolvedEndpoint);
      if (fix.useAuth !== false) {
        req = req.set('Authorization', `Bearer ${token}`);
      }
      if (fix.method !== 'GET' && fix.method !== 'DELETE') {
        req = req.send(fix.payload);
      }

      const res = await req;
      expect(
        res.status,
        `Fixture [${fix.id}] expected status ${fix.expectedStatus} on ${fix.method} ${resolvedEndpoint}, got ${res.status}: ${JSON.stringify(res.body)}`
      ).toBe(fix.expectedStatus);

      const resStr = JSON.stringify(res.body).toLowerCase();
      expect(
        resStr,
        `Fixture [${fix.id}] response did not contain expected substring "${fix.expectedErrorSubstring}": ${resStr}`
      ).toContain(fix.expectedErrorSubstring.toLowerCase());
    }
  });
});
