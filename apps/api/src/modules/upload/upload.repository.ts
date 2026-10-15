import { ObjectId, type Document, type Filter } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import type { TenantScope } from '../../types/tenant.js';

export interface BusinessDataDoc extends Document {
  _id: ObjectId;
  company_id: string;
  date: Date;
  product: string;
  category?: string;
  quantity: number;
  production_cost: number;
  selling_price: number;
  region?: string;
  customer_type?: string;
  created_at?: Date;
}

export interface FinancialSummaryDoc extends Document {
  _id: ObjectId;
  company_id: string;
  timestamp: Date;
  total_revenue: number;
  total_profit: number;
  worker_payments: number;
  active_workers: number;
}

export class UploadRepository {
  static async findOneBusinessData(scope: TenantScope, filter: Filter<BusinessDataDoc> = {}): Promise<BusinessDataDoc | null> {
    const col = getCollection<BusinessDataDoc>('business_data');
    return col.findOne({ ...filter, company_id: scope.companyId });
  }

  static async deleteFinancialSummaries(scope: TenantScope): Promise<void> {
    const col = getCollection<FinancialSummaryDoc>('financial_summaries');
    await col.deleteMany({ company_id: scope.companyId });
  }

  static async aggregateBusinessData(scope: TenantScope, pipeline: Document[]): Promise<Document[]> {
    const col = getCollection('business_data');
    return col.aggregate([{ $match: { company_id: scope.companyId } }, ...pipeline]).toArray();
  }

  static async insertFinancialSummary(scope: TenantScope, doc: Omit<FinancialSummaryDoc, '_id' | 'company_id'>): Promise<ObjectId> {
    const col = getCollection<FinancialSummaryDoc>('financial_summaries');
    const fullDoc = { ...doc, company_id: scope.companyId } as FinancialSummaryDoc;
    const res = await col.insertOne(fullDoc);
    return res.insertedId;
  }

  static async insertBusinessData(scope: TenantScope, doc: Omit<BusinessDataDoc, '_id' | 'company_id'>): Promise<ObjectId> {
    const col = getCollection<BusinessDataDoc>('business_data');
    const fullDoc = { ...doc, company_id: scope.companyId } as BusinessDataDoc;
    const res = await col.insertOne(fullDoc);
    return res.insertedId;
  }
}
