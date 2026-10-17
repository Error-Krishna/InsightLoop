import { ObjectId, type Document, type Filter } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import type { TenantScope } from '../../types/tenant.js';

export interface InsightDoc extends Document {
  _id: ObjectId;
  company_id: string;
  title: string;
  description: string;
  labels?: string[];
  data_points?: unknown[];
  note?: string;
  created_at?: Date;
}

export class InsightsRepository {
  static async findInsights(scope: TenantScope, filter: Filter<InsightDoc> = {}): Promise<InsightDoc[]> {
    const col = getCollection<InsightDoc>('insights');
    return col.find({ ...filter, company_id: scope.companyId }).sort({ created_at: -1 }).toArray();
  }

  static async findInsightById(scope: TenantScope, id: ObjectId | string): Promise<InsightDoc | null> {
    const col = getCollection<InsightDoc>('insights');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return col.findOne({ _id: objId, company_id: scope.companyId });
  }

  static async insertInsight(scope: TenantScope, doc: Omit<InsightDoc, '_id' | 'company_id'>): Promise<InsightDoc> {
    const col = getCollection<InsightDoc>('insights');
    const fullDoc = { ...doc, company_id: scope.companyId } as InsightDoc;
    const res = await col.insertOne(fullDoc);
    return { ...fullDoc, _id: res.insertedId };
  }

  static async deleteInsight(scope: TenantScope, id: ObjectId | string): Promise<boolean> {
    const col = getCollection<InsightDoc>('insights');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    const res = await col.deleteOne({ _id: objId, company_id: scope.companyId });
    return res.deletedCount > 0;
  }

  static async findBusinessData(scope: TenantScope, filter: Filter<Document>, projection: Document = {}): Promise<Document[]> {
    const col = getCollection('business_data');
    return col.find({ ...filter, company_id: scope.companyId }, { projection }).toArray();
  }
}
