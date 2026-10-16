import { ObjectId, type Document, type Filter } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import type { TenantScope } from '../../types/tenant.js';
import type { MaterialAssignmentDoc } from '../workers/workers.repository.js';

export interface BillDoc extends Document {
  _id: ObjectId;
  company_id: string;
  bill_type: string;
  invoice_number?: string;
  order_status?: string;
  buyer?: {
    name?: string;
    address?: string;
    gst_number?: string;
    phone?: string;
  };
  products?: {
    name: string;
    description?: string;
    quantity: number;
    rate: number;
    unit?: string;
    total?: number;
    amount?: number;
    discount?: number;
    tax?: number;
    tax_rate?: number;
    inventory_item_id?: string | null;
  }[];
  subtotal?: number;
  gst_percentage?: number;
  gst_amount?: number;
  discount?: number;
  grand_total?: number;
  profit_suggested_amount?: number | null;
  profit_confirmed?: boolean;
  profit_confirmed_at?: Date | null;
  profit_confirmed_amount?: number | null;
  shipment_confirmed?: boolean;
  shipment_confirmed_at?: Date | null;
  payments?: {
    amount: number;
    payment_mode?: string;
    date?: string | Date;
    notes?: string;
  }[];
  transportation_costs?: {
    amount: number;
    description?: string;
    date?: string | Date;
    notes?: string;
  }[];
  misc_costs?: {
    amount: number;
    description?: string;
    date?: string | Date;
    notes?: string;
  }[];
  ready_to_deliver?: {
    inventory_item_id?: string;
    item_name?: string;
    quantity: number;
    date?: string | Date;
    notes?: string;
  }[];
  worker_assignment_ids?: string[];
  created_at?: Date;
  updated_at?: Date;
}

export class BillsRepository {
  static async getNextInvoiceNumber(scope: TenantScope, forceResync = false): Promise<string> {
    const year = new Date().getFullYear();
    const countersCol = getCollection('counters');
    const billsCol = getCollection<BillDoc>('bills');

    const counterId = `invoice_${scope.companyId}_${year}`;
    const prefix = `INV-${year}-`;

    const resyncCounter = async (): Promise<number> => {
      const lastBill = await billsCol
        // eslint-disable-next-line security/detect-non-literal-regexp -- reason: prefix is hardcoded billing prefix
        .find({ company_id: scope.companyId, invoice_number: { $regex: new RegExp(`^${prefix}\\d+$`) } })
        .sort({ invoice_number: -1 })
        .limit(1)
        .toArray();

      let currentMax = 0;
      if (lastBill.length > 0 && lastBill[0].invoice_number) {
        const numPart = lastBill[0].invoice_number.slice(prefix.length);
        currentMax = parseInt(numPart, 10) || 0;
      }

      await countersCol.updateOne(
        { _id: counterId as unknown as ObjectId },
        { $max: { seq: currentMax } },
        { upsert: true }
      );
      return currentMax;
    };

    const counter = await countersCol.findOne({ _id: counterId as unknown as ObjectId });
    if (!counter || forceResync) {
      await resyncCounter();
    } else {
      const lastBill = await billsCol
        // eslint-disable-next-line security/detect-non-literal-regexp -- reason: prefix is hardcoded billing prefix
        .find({ company_id: scope.companyId, invoice_number: { $regex: new RegExp(`^${prefix}\\d+$`) } })
        .sort({ invoice_number: -1 })
        .limit(1)
        .toArray();
      if (lastBill.length > 0 && lastBill[0].invoice_number) {
        const numPart = lastBill[0].invoice_number.slice(prefix.length);
        const billMax = parseInt(numPart, 10) || 0;
        const currentSeq = (counter as { seq?: number }).seq ?? 0;
        if (billMax >= currentSeq) {
          await countersCol.updateOne(
            { _id: counterId as unknown as ObjectId },
            { $max: { seq: billMax } },
            { upsert: true }
          );
        }
      }
    }

    const updated = await countersCol.findOneAndUpdate(
      { _id: counterId as unknown as ObjectId },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );

    const seq = (updated as { seq?: number } | null)?.seq ?? 1;
    return `INV-${year}-${String(seq).padStart(5, '0')}`;
  }

  static async insertBillWithRetry(
    scope: TenantScope,
    docFactory: (invoiceNumber: string) => Omit<BillDoc, '_id' | 'company_id'>,
    maxAttempts = 5
  ): Promise<BillDoc> {
    const col = getCollection<BillDoc>('bills');
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const invoiceNumber = await this.getNextInvoiceNumber(scope, attempt > 0);
      const fullDoc = { ...docFactory(invoiceNumber), invoice_number: invoiceNumber, company_id: scope.companyId } as BillDoc;
      try {
        const res = await col.insertOne(fullDoc);
        return { ...fullDoc, _id: res.insertedId };
      } catch (err: unknown) {
        const isDupKey =
          (err as { code?: number })?.code === 11000 ||
          /E11000|duplicate key/i.test((err as Error)?.message || '');
        if (isDupKey && attempt < maxAttempts - 1) {
          continue;
        }
        if (isDupKey) {
          throw new Error('Could not generate a unique invoice number, please retry.', { cause: err });
        }
        throw err;
      }
    }
    throw new Error('Could not generate a unique invoice number, please retry.');
  }

  static async findBills(scope: TenantScope, filter: Filter<BillDoc> = {}): Promise<BillDoc[]> {
    const col = getCollection<BillDoc>('bills');
    return col.find({ ...filter, company_id: scope.companyId }).sort({ created_at: -1 }).toArray();
  }

  static async findBillById(scope: TenantScope, id: ObjectId | string): Promise<BillDoc | null> {
    const col = getCollection<BillDoc>('bills');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async insertBill(scope: TenantScope, doc: Omit<BillDoc, '_id' | 'company_id'>): Promise<BillDoc> {
    const col = getCollection<BillDoc>('bills');
    const fullDoc = { ...doc, company_id: scope.companyId } as BillDoc;
    const res = await col.insertOne(fullDoc);
    return { ...fullDoc, _id: res.insertedId };
  }

  static async updateBill(scope: TenantScope, id: ObjectId | string, update: Partial<BillDoc>): Promise<BillDoc | null> {
    const col = getCollection<BillDoc>('bills');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    await col.updateOne({ _id: objId, company_id: scope.companyId }, { $set: update });
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async updateBillRaw(scope: TenantScope, id: ObjectId | string, updateOps: Document): Promise<BillDoc | null> {
    const col = getCollection<BillDoc>('bills');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    await col.updateOne({ _id: objId, company_id: scope.companyId }, updateOps);
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async deleteBill(scope: TenantScope, id: ObjectId | string): Promise<boolean> {
    const col = getCollection<BillDoc>('bills');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    const res = await col.deleteOne({ _id: objId, company_id: scope.companyId });
    return res.deletedCount > 0;
  }

  static async findLinkedPayRecords(scope: TenantScope, billIdStr: string, workerAssignmentIds: string[]): Promise<Document[]> {
    const payRecordsCol = getCollection('pay_records');
    return payRecordsCol
      .find({
        company_id: scope.companyId,
        $or: [{ bill_id: billIdStr }, { source_assignment_id: { $in: workerAssignmentIds } }],
      })
      .toArray();
  }

  static async findLinkedPayRecordsForBills(scope: TenantScope, billIds: string[], allWorkerAssignmentIds: string[]): Promise<Document[]> {
    const payRecordsCol = getCollection('pay_records');
    const clauses: Record<string, unknown>[] = [{ bill_id: { $in: billIds } }];
    if (allWorkerAssignmentIds.length > 0) {
      clauses.push({ source_assignment_id: { $in: allWorkerAssignmentIds } });
    }
    return payRecordsCol
      .find({
        company_id: scope.companyId,
        $or: clauses,
      })
      .toArray();
  }

  static async findLinkedAssignments(scope: TenantScope, billIdStr: string): Promise<MaterialAssignmentDoc[]> {
    const assignmentsCol = getCollection<MaterialAssignmentDoc>('material_assignments');
    return assignmentsCol
      .find({
        company_id: scope.companyId,
        bill_id: billIdStr,
      })
      .toArray();
  }

  static async findLinkedAssignmentsForBills(scope: TenantScope, billIds: string[]): Promise<MaterialAssignmentDoc[]> {
    const assignmentsCol = getCollection<MaterialAssignmentDoc>('material_assignments');
    return assignmentsCol
      .find({
        company_id: scope.companyId,
        bill_id: { $in: billIds },
      })
      .toArray();
  }

  static async findInventoryItemById(scope: TenantScope, id: ObjectId | string): Promise<Document | null> {
    const itemsCol = getCollection('inventory_items');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return itemsCol.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async adjustInventoryStockById(scope: TenantScope, id: ObjectId | string, quantityChange: number): Promise<boolean> {
    const itemsCol = getCollection('inventory_items');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    const res = await itemsCol.updateOne(
      { _id: objId, company_id: scope.companyId },
      { $inc: { quantity: quantityChange } }
    );
    return res.matchedCount > 0;
  }

  static async adjustInventoryStockConditional(
    scope: TenantScope,
    id: ObjectId | string,
    quantityChange: number,
    minQuantity: number
  ): Promise<boolean> {
    const itemsCol = getCollection('inventory_items');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    const res = await itemsCol.updateOne(
      { _id: objId, company_id: scope.companyId, quantity: { $gte: minQuantity } },
      { $inc: { quantity: quantityChange } }
    );
    return res.matchedCount > 0;
  }
}

