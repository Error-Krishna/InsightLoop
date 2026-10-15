import { ObjectId, type Document, type Filter } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import type { TenantScope } from '../../types/tenant.js';

export interface WorkerDoc extends Document {
  _id: ObjectId;
  company_id: string;
  name: string;
  age?: number;
  address?: string;
  phone?: string;
  image_url?: string | null;
  joining_date?: Date;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface MaterialAssignmentDoc extends Document {
  _id: ObjectId;
  company_id: string;
  worker_id?: string;
  worker?: { _id?: ObjectId; name?: string } | ObjectId | string;
  bill_id?: string | null;
  material_name: string;
  quantity: number;
  price_per_unit?: number;
  unit?: string;
  status: string;
  wage_amount?: number;
  pay_record_id?: string | null;
  synced_to_inventory?: boolean;
  notes?: string;
  assignment_date?: Date;
  completed_at?: Date | null;
  wastage_quantity?: number | null;
  batches?: {
    batch_number?: string;
    quantity: number;
    delivered_at?: Date;
    date?: string | Date;
    notes?: string;
  }[];
  created_at?: Date;
  updated_at?: Date;
}

export interface PayRecordDoc extends Document {
  _id: ObjectId;
  company_id: string;
  worker_id?: string;
  worker?: { _id?: ObjectId; name?: string } | ObjectId | string;
  product_name?: string;
  bill_id?: string | null;
  source_assignment_id?: string | null;
  units_produced: number;
  rate_per_unit: number;
  amount_paid: number;
  paid: boolean;
  notes?: string;
  date?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class WorkersRepository {
  static async findWorkers(scope: TenantScope, filter: Filter<WorkerDoc> = {}): Promise<WorkerDoc[]> {
    const col = getCollection<WorkerDoc>('workers');
    return col.find({ ...filter, company_id: scope.companyId }).sort({ created_at: -1 }).toArray();
  }

  static async findWorkerById(scope: TenantScope, id: ObjectId | string): Promise<WorkerDoc | null> {
    const col = getCollection<WorkerDoc>('workers');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async insertWorker(scope: TenantScope, doc: Omit<WorkerDoc, '_id' | 'company_id'>): Promise<WorkerDoc> {
    const col = getCollection<WorkerDoc>('workers');
    const fullDoc = { ...doc, company_id: scope.companyId } as WorkerDoc;
    const res = await col.insertOne(fullDoc);
    return { ...fullDoc, _id: res.insertedId };
  }

  static async updateWorker(scope: TenantScope, id: ObjectId | string, update: Partial<WorkerDoc>): Promise<WorkerDoc | null> {
    const col = getCollection<WorkerDoc>('workers');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    await col.updateOne({ _id: objId, company_id: scope.companyId }, { $set: update });
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async deleteWorker(scope: TenantScope, id: ObjectId | string): Promise<boolean> {
    const col = getCollection<WorkerDoc>('workers');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    const res = await col.deleteOne({ _id: objId, company_id: scope.companyId });
    return res.deletedCount > 0;
  }

  static async findAssignments(scope: TenantScope, filter: Filter<MaterialAssignmentDoc> = {}): Promise<MaterialAssignmentDoc[]> {
    const col = getCollection<MaterialAssignmentDoc>('material_assignments');
    return col.find({ ...filter, company_id: scope.companyId }).sort({ assignment_date: -1 }).toArray();
  }

  static async findAssignmentsByWorker(scope: TenantScope, workerId: string): Promise<MaterialAssignmentDoc[]> {
    const col = getCollection<MaterialAssignmentDoc>('material_assignments');
    const objId = ObjectId.isValid(workerId) ? new ObjectId(workerId) : workerId;
    return col
      .find({
        company_id: scope.companyId,
        $or: [{ worker_id: workerId }, { 'worker._id': objId }, { worker: objId }],
      })
      .sort({ assignment_date: -1 })
      .toArray();
  }

  static async findAssignmentById(scope: TenantScope, id: ObjectId | string): Promise<MaterialAssignmentDoc | null> {
    const col = getCollection<MaterialAssignmentDoc>('material_assignments');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async insertAssignment(scope: TenantScope, doc: Omit<MaterialAssignmentDoc, '_id' | 'company_id'>): Promise<MaterialAssignmentDoc> {
    const col = getCollection<MaterialAssignmentDoc>('material_assignments');
    const fullDoc = { ...doc, company_id: scope.companyId } as MaterialAssignmentDoc;
    const res = await col.insertOne(fullDoc);
    return { ...fullDoc, _id: res.insertedId };
  }

  static async updateAssignment(scope: TenantScope, id: ObjectId | string, update: Partial<MaterialAssignmentDoc>): Promise<MaterialAssignmentDoc | null> {
    const col = getCollection<MaterialAssignmentDoc>('material_assignments');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    await col.updateOne({ _id: objId, company_id: scope.companyId }, { $set: update });
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async addBatchToAssignment(scope: TenantScope, id: ObjectId | string, batch: Document): Promise<MaterialAssignmentDoc | null> {
    const col = getCollection<MaterialAssignmentDoc>('material_assignments');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    await col.updateOne(
      { _id: objId, company_id: scope.companyId },
      {
        $push: { batches: batch } as Document,
        $set: { updated_at: new Date() },
      }
    );
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async deleteAssignmentsByWorker(scope: TenantScope, workerId: string): Promise<void> {
    const col = getCollection<MaterialAssignmentDoc>('material_assignments');
    const objId = ObjectId.isValid(workerId) ? new ObjectId(workerId) : workerId;
    await col.deleteMany({
      company_id: scope.companyId,
      $or: [{ worker_id: workerId }, { 'worker._id': objId }, { worker: objId }],
    });
  }

  static async findPayments(scope: TenantScope, filter: Filter<PayRecordDoc> = {}): Promise<PayRecordDoc[]> {
    const col = getCollection<PayRecordDoc>('pay_records');
    return col.find({ ...filter, company_id: scope.companyId }).sort({ date: -1 }).toArray();
  }

  static async findPaymentsByWorker(scope: TenantScope, workerId: string): Promise<PayRecordDoc[]> {
    const col = getCollection<PayRecordDoc>('pay_records');
    const objId = ObjectId.isValid(workerId) ? new ObjectId(workerId) : workerId;
    return col
      .find({
        company_id: scope.companyId,
        $or: [{ worker_id: workerId }, { 'worker._id': objId }, { worker: objId }],
      })
      .sort({ date: -1 })
      .toArray();
  }

  static async findPaymentById(scope: TenantScope, id: ObjectId | string): Promise<PayRecordDoc | null> {
    const col = getCollection<PayRecordDoc>('pay_records');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async insertPayment(scope: TenantScope, doc: Omit<PayRecordDoc, '_id' | 'company_id'>): Promise<PayRecordDoc> {
    const col = getCollection<PayRecordDoc>('pay_records');
    const fullDoc = { ...doc, company_id: scope.companyId } as PayRecordDoc;
    const res = await col.insertOne(fullDoc);
    return { ...fullDoc, _id: res.insertedId };
  }

  static async updatePayment(scope: TenantScope, id: ObjectId | string, update: Partial<PayRecordDoc>): Promise<PayRecordDoc | null> {
    const col = getCollection<PayRecordDoc>('pay_records');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    await col.updateOne({ _id: objId, company_id: scope.companyId }, { $set: update });
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async deletePaymentsByWorker(scope: TenantScope, workerId: string): Promise<void> {
    const col = getCollection<PayRecordDoc>('pay_records');
    const objId = ObjectId.isValid(workerId) ? new ObjectId(workerId) : workerId;
    await col.deleteMany({
      company_id: scope.companyId,
      $or: [{ worker_id: workerId }, { 'worker._id': objId }, { worker: objId }],
    });
  }

  static async syncFinishedInventory(scope: TenantScope, materialName: string, quantity: number): Promise<void> {
    const itemsCol = getCollection('inventory_items');
    const escapedName = materialName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await itemsCol.updateOne(
      {
        company_id: scope.companyId,
        type: 'finished',
        // eslint-disable-next-line security/detect-non-literal-regexp
        name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
      },
      { $inc: { quantity } }
    );
  }

  static async linkBillWorkerAssignment(scope: TenantScope, billId: string, assignmentId: string): Promise<void> {
    const billsCol = getCollection('bills');
    await billsCol.updateOne(
      { _id: new ObjectId(billId), company_id: scope.companyId },
      { $addToSet: { worker_assignment_ids: assignmentId } }
    );
  }

  static async findBillById(scope: TenantScope, id: string): Promise<Document | null> {
    const billsCol = getCollection('bills');
    return billsCol.findOne({ _id: new ObjectId(id), company_id: scope.companyId });
  }
}
