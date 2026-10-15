import { ObjectId, type Document } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import type { TenantScope } from '../../types/tenant.js';

export class AiRepository {
  static async aggregateBusinessData<T extends Document = Document>(scope: TenantScope, pipeline: Document[]): Promise<T[]> {
    const col = getCollection('business_data');
    return col.aggregate<T>([{ $match: { company_id: scope.companyId } }, ...pipeline]).toArray();
  }

  static async countInventory(scope: TenantScope): Promise<number> {
    const col = getCollection('inventory_items');
    return col.countDocuments({ company_id: scope.companyId });
  }

  static async countWorkers(scope: TenantScope): Promise<number> {
    const col = getCollection('workers');
    return col.countDocuments({ company_id: scope.companyId });
  }

  static async countBills(scope: TenantScope): Promise<number> {
    const col = getCollection('bills');
    return col.countDocuments({ company_id: scope.companyId });
  }

  static async findActiveWorkers(scope: TenantScope): Promise<Document[]> {
    const col = getCollection('workers');
    return col.find({ company_id: scope.companyId, is_active: true }).toArray();
  }

  static async findWorkerPayRecords(scope: TenantScope, workerId: ObjectId | string): Promise<Document[]> {
    const col = getCollection('pay_records');
    return col.find({ company_id: scope.companyId, worker: workerId }).toArray();
  }

  static async findWorkerMaterials(scope: TenantScope, workerId: ObjectId | string): Promise<Document[]> {
    const col = getCollection('material_assignments');
    return col.find({ company_id: scope.companyId, worker: workerId }).toArray();
  }
}
