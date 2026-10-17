import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { getDb, connectMongo, closeMongo } from '../src/db/mongo.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import type { TenantScope } from '../src/types/tenant.js';

const rootDir = path.resolve(__dirname, '../../..');
const pythonBin = path.join(rootDir, '.venv/bin/python');

describe('B2: Dashboard Top Workers & Deleted Worker Handling', () => {
  const scope: TenantScope = { companyId: 'test-b2-company-' + Date.now() };
  let nodeWorkerId: string;
  let djangoWorkerId: string;

  beforeAll(async () => {
    await connectMongo();

    // 1. Create a worker via Node
    const nodeWorker = await WorkersRepository.insertWorker(scope, {
      name: 'Node Top Worker',
      phone: '1111111111',
      address: 'Node Workshop',
      created_at: new Date(),
      is_active: true,
    });
    nodeWorkerId = nodeWorker._id.toString();

    // 2. Create a worker via Django
    const djWorkerOut = execSync(
      `MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" "${pythonBin}" -c "
import os, sys, django
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
import worker.models as wm

w = wm.Worker(company_id='${scope.companyId}', name='Django Top Worker', phone='2222222222', is_active=True).save()
print(str(w.id))
"`,
      { cwd: rootDir, encoding: 'utf-8' }
    ).trim();
    djangoWorkerId = djWorkerOut;

    // 3. Create payments via Node for Node worker (total payout: 500)
    await WorkersService.createPayment(scope, nodeWorkerId, {
      product_name: 'Product A',
      units_produced: 5,
      rate_per_unit: 100,
      amount_paid: 500,
    });

    // 4. Create payments via Django for Django worker (total payout: 800)
    execSync(
      `MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" "${pythonBin}" -c "
import os, sys, django
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
import worker.models as wm
from datetime import datetime
from bson import ObjectId

w = wm.Worker.objects.get(id=ObjectId('${djangoWorkerId}'))
pr = wm.PayRecord(
    company_id='${scope.companyId}',
    worker=w,
    product_name='Product B',
    units_produced=8,
    rate_per_unit=100.0,
    amount_paid=800.0,
    paid=True,
    date=datetime.now()
).save()
print('DJANGO_PAY_CREATED')
"`,
      { cwd: rootDir, encoding: 'utf-8' }
    );
  });

  afterAll(async () => {
    const db = getDb();
    await db.collection('workers').deleteMany({ company_id: scope.companyId });
    await db.collection('pay_records').deleteMany({ company_id: scope.companyId });
    await db.collection('material_assignments').deleteMany({ company_id: scope.companyId });
    await closeMongo();
  });

  it('aggregates top workers correctly across both Node-created and Django-created records', async () => {
    // Fetch top workers via Node
    const nodeTopWorkers = await DashboardService.getTopWorkers(scope);
    expect(nodeTopWorkers.length).toBe(2);

    // Rank 1 should be Django Top Worker (800)
    expect(nodeTopWorkers[0].name).toBe('Django Top Worker');
    expect(nodeTopWorkers[0].total_payout).toBe(800);
    expect(nodeTopWorkers[0].payment_count).toBe(1);

    // Rank 2 should be Node Top Worker (500)
    expect(nodeTopWorkers[1].name).toBe('Node Top Worker');
    expect(nodeTopWorkers[1].total_payout).toBe(500);
    expect(nodeTopWorkers[1].payment_count).toBe(1);

    // Compare with Django get_top_workers output
    const djTopWorkersJson = execSync(
      `MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" "${pythonBin}" -c "
import os, sys, django, json
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
import dashboard.utils as du

top = du.get_top_workers('${scope.companyId}')
print(json.dumps(top))
"`,
      { cwd: rootDir, encoding: 'utf-8' }
    ).trim();

    const djTopWorkers = JSON.parse(djTopWorkersJson);
    expect(djTopWorkers.length).toBe(2);
    expect(djTopWorkers[0].name).toBe(nodeTopWorkers[0].name);
    expect(djTopWorkers[0].total_payout).toBe(nodeTopWorkers[0].total_payout);
    expect(djTopWorkers[1].name).toBe(nodeTopWorkers[1].name);
    expect(djTopWorkers[1].total_payout).toBe(nodeTopWorkers[1].total_payout);
  });

  it('handles deleted worker gracefully with "Deleted Worker" fallback matching Django', async () => {
    // Create a temporary worker and payment
    const tempWorker = await WorkersRepository.insertWorker(scope, {
      name: 'Temporary Worker',
      is_active: true,
      created_at: new Date(),
    });
    const tempWorkerId = tempWorker._id.toString();

    await WorkersService.createPayment(scope, tempWorkerId, {
      product_name: 'Temp Product',
      units_produced: 1,
      rate_per_unit: 50,
      amount_paid: 50,
    });

    // Delete the worker from the DB directly without deleting the pay records
    const db = getDb();
    await db.collection('workers').deleteOne({ _id: new ObjectId(tempWorkerId) });

    // Fetch payments via Node DashboardService
    const payments = await DashboardService.getWorkerPayments(scope);
    const deletedRecord = payments.find((p) => p.amount === 50 && p.amount_paid === 50);
    expect(deletedRecord).toBeDefined();
    expect(deletedRecord!.name).toBe('Deleted Worker');

    // Compare with Django get_worker_payments
    const djPaymentsJson = execSync(
      `MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" "${pythonBin}" -c "
import os, sys, django, json
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
import dashboard.utils as du

records = du.get_worker_payments('${scope.companyId}')
print(json.dumps(records))
"`,
      { cwd: rootDir, encoding: 'utf-8' }
    ).trim();

    const djPayments = JSON.parse(djPaymentsJson);
    const djDeleted = djPayments.find((p: any) => p.amount === 50 && p.amount_paid === 50);
    expect(djDeleted).toBeDefined();
    expect(djDeleted.name).toBe('Deleted Worker');
  });
});
