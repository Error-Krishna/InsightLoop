import { ObjectId, type Document, type Filter } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import type { TenantScope } from '../../types/tenant.js';

export class DashboardRepository {
  static async findBills(scope: TenantScope, filter: Filter<Document> = {}, projection: Document = {}): Promise<Document[]> {
    const col = getCollection('bills');
    return col.find({ ...filter, company_id: scope.companyId }, { projection }).toArray();
  }

  static async aggregateBills(scope: TenantScope, pipeline: Document[]): Promise<Document[]> {
    const col = getCollection('bills');
    return col.aggregate([{ $match: { company_id: scope.companyId } }, ...pipeline]).toArray();
  }

  static async countBills(scope: TenantScope, filter: Filter<Document> = {}): Promise<number> {
    const col = getCollection('bills');
    return col.countDocuments({ ...filter, company_id: scope.companyId });
  }

  static async aggregateBusinessData(scope: TenantScope, pipeline: Document[]): Promise<Document[]> {
    const col = getCollection('business_data');
    return col.aggregate([{ $match: { company_id: scope.companyId } }, ...pipeline]).toArray();
  }

  static async countWorkers(scope: TenantScope, filter: Filter<Document> = {}): Promise<number> {
    const col = getCollection('workers');
    return col.countDocuments({ ...filter, company_id: scope.companyId });
  }

  static async findWorkersByIds(scope: TenantScope, ids: (ObjectId | string)[]): Promise<{ _id: ObjectId; name?: string }[]> {
    const col = getCollection<{ _id: ObjectId; name?: string; company_id: string }>('workers');
    const objIds = ids.map((id) => (typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : id));
    return col.find({ company_id: scope.companyId, _id: { $in: objIds as ObjectId[] } } as Filter<{ _id: ObjectId; name?: string; company_id: string }>).toArray();
  }

  static async aggregatePayRecords<T extends Document = Document>(scope: TenantScope, pipeline: Document[]): Promise<T[]> {
    const col = getCollection('pay_records');
    return col.aggregate<T>([{ $match: { company_id: scope.companyId } }, ...pipeline]).toArray();
  }

  static async findRecentPayRecords(scope: TenantScope, limit = 10): Promise<Document[]> {
    const col = getCollection('pay_records');
    return col.find({ company_id: scope.companyId }).sort({ date: -1 }).limit(limit).toArray();
  }

  static async findBusinessData(scope: TenantScope): Promise<Document[]> {
    const col = getCollection('business_data');
    return col.find({ company_id: scope.companyId }).sort({ date: 1 }).toArray();
  }

  static async findAllWorkers(scope: TenantScope): Promise<Document[]> {
    const col = getCollection('workers');
    return col.find({ company_id: scope.companyId }).toArray();
  }

  static async findAssignmentsForWorker(scope: TenantScope, workerId: ObjectId): Promise<Document[]> {
    const col = getCollection('assignments');
    return col.find({ company_id: scope.companyId, worker: workerId }).toArray();
  }

  static async findPayRecordsForWorker(scope: TenantScope, workerId: ObjectId): Promise<Document[]> {
    const col = getCollection('pay_records');
    return col.find({ company_id: scope.companyId, worker: workerId }).toArray();
  }

  static async findAllPayRecords(scope: TenantScope): Promise<Document[]> {
    const col = getCollection('pay_records');
    return col.find({ company_id: scope.companyId }).sort({ date: -1 }).toArray();
  }

  static async findFinancialSummaries(scope: TenantScope): Promise<Document[]> {
    const col = getCollection('financial_summary');
    return col.find({ company_id: scope.companyId }).sort({ timestamp: -1 }).toArray();
  }

  static async findInsights(scope: TenantScope): Promise<Document[]> {
    const col = getCollection('insights');
    return col.find({ company_id: scope.companyId }).sort({ created_at: -1 }).toArray();
  }
}
