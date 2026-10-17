import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { getDb, getCollection, connectMongo, closeMongo } from '../src/db/mongo.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import type { TenantScope } from '../src/types/tenant.js';

const rootDir = path.resolve(__dirname, '../../..');
const pythonBin = path.join(rootDir, '.venv/bin/python');

describe('B1: Document Shape & MongoEngine Strictness', () => {
  const scope: TenantScope = { companyId: 'test-b1-company-' + Date.now() };
  let workerId: string;

  beforeAll(async () => {
    await connectMongo();
    const worker = await WorkersRepository.insertWorker(scope, {
      name: 'B1 Worker Test',
      phone: '9999999999',
      address: 'Test Workshop',
      created_at: new Date(),
      is_active: true,
    });
    workerId = worker._id.toString();
  });

  afterAll(async () => {
    const db = getDb();
    await db.collection('workers').deleteMany({ company_id: scope.companyId });
    await db.collection('material_assignments').deleteMany({ company_id: scope.companyId });
    await db.collection('pay_records').deleteMany({ company_id: scope.companyId });
    await closeMongo();
  });

  it('rejects zero or negative price_per_unit and quantity on MaterialAssignment', async () => {
    await expect(
      WorkersService.createMaterial(scope, workerId, {
        material_name: 'Timber',
        quantity: 0,
        price_per_unit: 10,
      })
    ).rejects.toThrow(/positive/i);

    await expect(
      WorkersService.createMaterial(scope, workerId, {
        material_name: 'Timber',
        quantity: 10,
        price_per_unit: 0,
      })
    ).rejects.toThrow(/positive/i);
  });

  it('MaterialAssignment document written to MongoDB has worker as ObjectId and NO worker_id field', async () => {
    const created = await WorkersService.createMaterial(scope, workerId, {
      material_name: 'Pine Wood',
      quantity: 5,
      price_per_unit: 12.5,
      notes: 'Testing doc shape',
    });

    const raw = await getCollection('material_assignments').findOne({ _id: new ObjectId(created.id) });
    expect(raw).toBeDefined();

    // worker must be a plain ObjectId (MongoEngine ReferenceField)
    expect(raw!.worker).toBeInstanceOf(ObjectId);
    expect((raw!.worker as ObjectId).toString()).toBe(workerId);

    // worker_id field must NOT be stored in MongoDB
    expect(raw!.worker_id).toBeUndefined();

    // Verify Django can load this document without FieldDoesNotExist
    const checkOutput = execSync(
      `MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" "${pythonBin}" -c "
import os, sys, django
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
import worker.models as wm
from bson import ObjectId

doc = wm.MaterialAssignment.objects.get(id=ObjectId('${created.id}'))
assert doc.material_name == 'Pine Wood'
assert str(doc.worker.id) == '${workerId}'
print('DJANGO_LOAD_OK')
"`,
      { cwd: rootDir, encoding: 'utf-8' }
    );
    expect(checkOutput).toContain('DJANGO_LOAD_OK');
  });

  it('PayRecord document written to MongoDB has worker as ObjectId and NO worker_id field', async () => {
    const payment = await WorkersService.createPayment(scope, workerId, {
      product_name: 'Finished Desk',
      units_produced: 2,
      rate_per_unit: 150,
      amount_paid: 100,
    });

    const raw = await getCollection('pay_records').findOne({ _id: new ObjectId(payment.id) });
    expect(raw).toBeDefined();

    // worker must be a plain ObjectId
    expect(raw!.worker).toBeInstanceOf(ObjectId);
    expect((raw!.worker as ObjectId).toString()).toBe(workerId);

    // worker_id field must NOT be stored in MongoDB
    expect(raw!.worker_id).toBeUndefined();

    // Verify Django can load this document without FieldDoesNotExist
    const checkOutput = execSync(
      `MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" "${pythonBin}" -c "
import os, sys, django
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
import worker.models as wm
from bson import ObjectId

doc = wm.PayRecord.objects.get(id=ObjectId('${payment.id}'))
assert doc.product_name == 'Finished Desk'
assert str(doc.worker.id) == '${workerId}'
print('DJANGO_PAY_LOAD_OK')
"`,
      { cwd: rootDir, encoding: 'utf-8' }
    );
    expect(checkOutput).toContain('DJANGO_PAY_LOAD_OK');
  });

  it('dual-stack test: Node writes every entity type; Django loads, lists, updates, and deletes each with zero errors', async () => {
    const { BillsRepository } = await import('../src/modules/bills/bills.repository.js');
    const { InventoryRepository } = await import('../src/modules/inventory/inventory.repository.js');
    const { ContactRepository } = await import('../src/modules/contact/contact.repository.js');

    // 1. Worker
    const worker = await WorkersRepository.insertWorker(scope, {
      name: 'DualStack Worker',
      phone: '8888888888',
      address: 'DualStack Street',
      is_active: true,
      created_at: new Date(),
    });

    // 2. MaterialAssignment
    const assignment = await WorkersService.createMaterial(scope, worker._id.toString(), {
      material_name: 'Oak Planks',
      quantity: 15,
      price_per_unit: 20.0,
      notes: 'DualStack test notes',
    });

    // 3. PayRecord
    const payRecord = await WorkersService.createPayment(scope, worker._id.toString(), {
      product_name: 'Oak Chair',
      units_produced: 3,
      rate_per_unit: 80.0,
      amount_paid: 120.0,
    });

    // 4. Warehouse
    const warehouse = await InventoryRepository.insertWarehouse(scope, {
      name: 'DualStack Depot',
      location: 'Block D',
      created_at: new Date(),
    });

    // 5. InventoryItem
    const inventoryItem = await InventoryRepository.insertItem(scope, {
      type: 'finished',
      name: 'Oak Chair Stock',
      unit: 'pcs',
      selling_price: 150.0,
      cost_price: 90.0,
      quantity: 25.0,
      reorder_level: 5.0,
      warehouse_id: warehouse._id.toString(),
      sku: 'SKU-DUAL-' + Date.now(),
      created_at: new Date(),
    });

    // 6. Bill
    const bill = await BillsRepository.insertBill(scope, {
      bill_type: 'pakka',
      invoice_number: 'INV-DUAL-' + Date.now(),
      buyer: { name: 'DualStack Customer', phone: '7777777777' },
      products: [
        {
          name: 'Oak Chair Stock',
          quantity: 2,
          rate: 150.0,
          amount: 300.0,
          inventory_item_id: inventoryItem._id.toString(),
        },
      ],
      subtotal: 300.0,
      gst_percentage: 18.0,
      gst_amount: 54.0,
      discount: 0.0,
      grand_total: 354.0,
      payments: [],
      profit_confirmed: false,
      profit_suggested_amount: 0,
      profit_confirmed_amount: 0,
      profit_confirmed_at: null,
      worker_assignment_ids: [assignment.id],
      transportation_costs: [],
      misc_costs: [],
      ready_to_deliver: [],
      shipment_confirmed: false,
      shipment_confirmed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 7. ContactMessage
    const contactId = await ContactRepository.insertMessage({
      name: 'Support User',
      email: 'support@example.com',
      message: 'Dual-stack verification message',
      created_at: new Date(),
    });

    // Verify all with check_doc_shape
    const shapeOutput = execSync(`node "${path.join(rootDir, 'scripts/check_doc_shape.mjs')}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        MONGODB_URI: 'mongodb://localhost:27017/InsightLoop_test',
        MONGODB_DB_NAME: 'InsightLoop_test',
      },
    });
    expect(shapeOutput).toContain('conform strictly to Django MongoEngine models');

    // Run Django verification: Load, List, Update, and Delete each entity via Django MongoEngine
    const dualStackPy = execSync(
      `MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" "${pythonBin}" -c "
import os, sys, django
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
from bson import ObjectId
import worker.models as wm
import bills.models as bm
import inventory.models as im
import landing.mongo_models as lm

cid = '${scope.companyId}'

# 1. Worker
w = wm.Worker.objects.get(id=ObjectId('${worker._id.toString()}'))
assert w.company_id == cid
w_list = list(wm.Worker.objects.filter(company_id=cid))
assert len(w_list) >= 1
w.address = 'Updated Address'
w.save()

# 2. MaterialAssignment
ma = wm.MaterialAssignment.objects.get(id=ObjectId('${assignment.id}'))
assert ma.company_id == cid
assert str(ma.worker.id) == '${worker._id.toString()}'
ma_list = list(wm.MaterialAssignment.objects.filter(company_id=cid))
assert len(ma_list) >= 1
ma.notes = 'Updated by Django'
ma.save()

# 3. PayRecord
pr = wm.PayRecord.objects.get(id=ObjectId('${payRecord.id}'))
assert pr.company_id == cid
assert str(pr.worker.id) == '${worker._id.toString()}'
pr_list = list(wm.PayRecord.objects.filter(company_id=cid))
assert len(pr_list) >= 1
pr.product_name = 'Updated Product'
pr.save()

# 4. Warehouse
wh = im.Warehouse.objects.get(id=ObjectId('${warehouse._id.toString()}'))
assert wh.company_id == cid
wh.location = 'Updated Location'
wh.save()

# 5. InventoryItem
item = im.InventoryItem.objects.get(id=ObjectId('${inventoryItem._id.toString()}'))
assert item.company_id == cid
item.quantity = 30.0
item.save()

# 6. Bill
b = bm.Bill.objects.get(id=ObjectId('${bill._id.toString()}'))
assert b.company_id == cid
b.discount = 10.0
b.save()

# 7. ContactMessage
msg = lm.ContactMessage.objects.get(id=ObjectId('${contactId.toString()}'))
assert msg.name == 'Support User'
msg.message = 'Updated contact message'
msg.save()

# Deletions
b.delete()
item.delete()
wh.delete()
ma.delete()
pr.delete()
w.delete()
msg.delete()

print('DJANGO_DUAL_STACK_ALL_PASSED')
"`,
      { cwd: rootDir, encoding: 'utf-8' }
    );

    expect(dualStackPy).toContain('DJANGO_DUAL_STACK_ALL_PASSED');
  });

  it('syncFinishedInventory generates unique SKUs without colliding on (company_id, sku) index when multiple finished products complete', async () => {
    // 1. Ensure compound unique index exists on inventory_items
    const db = getDb();
    const indexes = await db.collection('inventory_items').indexes();
    const hasSkuIndex = indexes.some((idx) => idx.key?.company_id === 1 && idx.key?.sku === 1 && idx.unique);
    if (!hasSkuIndex) {
      await db.collection('inventory_items').createIndex({ company_id: 1, sku: 1 }, { unique: true });
    }

    // 2. Create worker and two separate assignments
    const worker = await WorkersRepository.insertWorker(scope, {
      name: 'SKU Test Artisan',
      phone: '9988776655',
      address: 'Artisan Hub',
      is_active: true,
      created_at: new Date(),
    });

    const assign1 = await WorkersService.createMaterial(scope, worker._id.toString(), {
      material_name: 'Raw Cotton',
      quantity: 10,
      price_per_unit: 50,
      notes: 'Job 1',
    });

    const assign2 = await WorkersService.createMaterial(scope, worker._id.toString(), {
      material_name: 'Raw Silk',
      quantity: 10,
      price_per_unit: 100,
      notes: 'Job 2',
    });

    // Add batches
    await WorkersService.addBatch(scope, assign1.id, { quantity: 10 });
    await WorkersService.addBatch(scope, assign2.id, { quantity: 10 });

    // 3. Complete both assignments (triggers syncFinishedInventory)
    const completed1 = await WorkersService.completeAssignment(scope, assign1.id);
    const completed2 = await WorkersService.completeAssignment(scope, assign2.id);

    expect(completed1.status).toBe('completed');
    expect(completed2.status).toBe('completed');

    // 4. Verify both finished inventory items exist and have distinct non-empty SKUs
    const items = await db.collection('inventory_items').find({
      company_id: scope.companyId,
      type: 'finished',
    }).toArray();

    expect(items.length).toBeGreaterThanOrEqual(2);
    const skus = items.map((i) => i.sku).filter(Boolean);
    expect(skus.length).toBeGreaterThanOrEqual(2);

    // Ensure none have sku: ''
    for (const item of items) {
      expect(item.sku).toBeDefined();
      expect(typeof item.sku).toBe('string');
      expect(item.sku.length).toBeGreaterThan(0);
      expect(item.sku).not.toBe('');
      // Type casing check
      expect(item.type).toBe('finished');
    }

    // Ensure SKUs are unique
    const uniqueSkus = new Set(skus);
    expect(uniqueSkus.size).toBe(skus.length);
  });
});
