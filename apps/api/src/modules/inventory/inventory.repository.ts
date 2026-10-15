import { ObjectId, type Document, type Filter } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import type { TenantScope } from '../../types/tenant.js';

export interface InventoryItemDoc extends Document {
  _id: ObjectId;
  company_id: string;
  type: string;
  name: string;
  unit?: string;
  selling_price: number;
  cost_price: number;
  quantity: number;
  reorder_level?: number;
  warehouse_id?: string | null;
  image_url?: string | null;
  sku?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface WarehouseDoc extends Document {
  _id: ObjectId;
  company_id: string;
  name: string;
  location?: string;
  created_at?: Date;
}

export interface CounterDoc extends Document {
  _id: string;
  seq: number;
}

export interface OpenAssignmentDoc extends Document {
  _id: ObjectId;
  company_id: string;
  status: string;
  material_name?: string;
  quantity?: number;
  worker_id?: string;
  worker?: ObjectId | string | { _id?: unknown; name?: string };
  bill_id?: ObjectId | string;
  batches?: { quantity?: number }[];
  assignment_date?: Date;
}

export interface InventoryWorkerDoc extends Document {
  _id: ObjectId;
  name?: string;
}

export interface InventoryBillDoc extends Document {
  _id: ObjectId;
  invoice_number?: string;
  order_status?: string;
  buyer?: { name?: string };
}

export class InventoryRepository {
  static async getNextSku(scope: TenantScope): Promise<string> {
    const countersCol = getCollection<CounterDoc>('counters');
    const itemsCol = getCollection<InventoryItemDoc>('inventory_items');

    const counterId = `sku_${scope.companyId}`;
    const counter = await countersCol.findOne({ _id: counterId });

    if (!counter) {
      const lastItem = await itemsCol
        .find({ company_id: scope.companyId, sku: { $regex: /^SKU-\d+$/ } })
        .sort({ sku: -1 })
        .limit(1)
        .toArray();

      let startingSeq = 0;
      if (lastItem.length > 0 && lastItem[0].sku) {
        const match = /^SKU-(\d+)$/.exec(lastItem[0].sku);
        if (match) startingSeq = parseInt(match[1], 10);
      }

      await countersCol.updateOne(
        { _id: counterId },
        { $setOnInsert: { seq: startingSeq } },
        { upsert: true }
      );
    }

    const updated = await countersCol.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );

    const seq = updated?.seq ?? 1;
    return `SKU-${String(seq).padStart(5, '0')}`;
  }

  static async findItems(scope: TenantScope, filter: Filter<InventoryItemDoc> = {}): Promise<InventoryItemDoc[]> {
    const itemsCol = getCollection<InventoryItemDoc>('inventory_items');
    return itemsCol
      .find({ ...filter, company_id: scope.companyId })
      .sort({ updated_at: -1, _id: -1 })
      .toArray();
  }

  static async findItemById(scope: TenantScope, id: ObjectId | string): Promise<InventoryItemDoc | null> {
    const itemsCol = getCollection<InventoryItemDoc>('inventory_items');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return itemsCol.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async insertItem(scope: TenantScope, doc: Omit<InventoryItemDoc, '_id' | 'company_id'>): Promise<InventoryItemDoc> {
    const itemsCol = getCollection<InventoryItemDoc>('inventory_items');
    const fullDoc = { ...doc, company_id: scope.companyId } as InventoryItemDoc;
    const res = await itemsCol.insertOne(fullDoc);
    return { ...fullDoc, _id: res.insertedId };
  }

  static async updateItem(scope: TenantScope, id: ObjectId | string, update: Partial<InventoryItemDoc>): Promise<InventoryItemDoc | null> {
    const itemsCol = getCollection<InventoryItemDoc>('inventory_items');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    await itemsCol.updateOne({ _id: objId, company_id: scope.companyId }, { $set: update });
    return itemsCol.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async deleteItem(scope: TenantScope, id: ObjectId | string): Promise<boolean> {
    const itemsCol = getCollection<InventoryItemDoc>('inventory_items');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    const res = await itemsCol.deleteOne({ _id: objId, company_id: scope.companyId });
    return res.deletedCount > 0;
  }

  static async findWarehouses(scope: TenantScope): Promise<WarehouseDoc[]> {
    const col = getCollection<WarehouseDoc>('warehouses');
    return col.find({ company_id: scope.companyId }).sort({ name: 1 }).toArray();
  }

  static async findWarehousesByIds(scope: TenantScope, ids: (ObjectId | string)[]): Promise<WarehouseDoc[]> {
    const col = getCollection<WarehouseDoc>('warehouses');
    const objIds = ids.map((id) => (typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : id));
    return col.find({ company_id: scope.companyId, _id: { $in: objIds as ObjectId[] } }).toArray();
  }

  static async findWarehouseById(scope: TenantScope, id: ObjectId | string): Promise<WarehouseDoc | null> {
    const col = getCollection<WarehouseDoc>('warehouses');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async insertWarehouse(scope: TenantScope, doc: Omit<WarehouseDoc, '_id' | 'company_id'>): Promise<WarehouseDoc> {
    const col = getCollection<WarehouseDoc>('warehouses');
    const fullDoc = { ...doc, company_id: scope.companyId } as WarehouseDoc;
    const res = await col.insertOne(fullDoc);
    return { ...fullDoc, _id: res.insertedId };
  }

  static async updateWarehouse(scope: TenantScope, id: ObjectId | string, update: Partial<WarehouseDoc>): Promise<WarehouseDoc | null> {
    const col = getCollection<WarehouseDoc>('warehouses');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    await col.updateOne({ _id: objId, company_id: scope.companyId }, { $set: update });
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async deleteWarehouse(scope: TenantScope, id: ObjectId | string): Promise<boolean> {
    const col = getCollection<WarehouseDoc>('warehouses');
    const itemsCol = getCollection<InventoryItemDoc>('inventory_items');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;

    await itemsCol.updateMany(
      { company_id: scope.companyId, warehouse_id: objId.toString() },
      { $set: { warehouse_id: null } }
    );
    const res = await col.deleteOne({ _id: objId, company_id: scope.companyId });
    return res.deletedCount > 0;
  }

  static async findOpenAssignments(scope: TenantScope): Promise<OpenAssignmentDoc[]> {
    const assignmentsCol = getCollection<OpenAssignmentDoc>('material_assignments');
    return assignmentsCol
      .find({ company_id: scope.companyId, status: 'open' })
      .sort({ assignment_date: -1 })
      .toArray();
  }

  static async findWorkersByIds(scope: TenantScope, ids: (ObjectId | string)[]): Promise<InventoryWorkerDoc[]> {
    const workersCol = getCollection<InventoryWorkerDoc>('workers');
    const objIds = ids.map((id) => (typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : id));
    return workersCol.find({ company_id: scope.companyId, _id: { $in: objIds as ObjectId[] } } as Document).toArray();
  }

  static async findBillById(scope: TenantScope, id: ObjectId | string): Promise<InventoryBillDoc | null> {
    const billsCol = getCollection<InventoryBillDoc>('bills');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return billsCol.findOne({ _id: objId, company_id: scope.companyId } as Document);
  }
}
