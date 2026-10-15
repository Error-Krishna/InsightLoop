import { ObjectId } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import type { TenantScope } from '../../types/tenant.js';
import type { CompanyDoc, UserDoc } from '../auth/auth.repository.js';

export class ProfileRepository {
  static async getUserById(userId: string): Promise<UserDoc | null> {
    const usersCol = getCollection<UserDoc>('user');
    return usersCol.findOne({ _id: new ObjectId(userId) });
  }

  static async getCompany(scope: TenantScope): Promise<CompanyDoc | null> {
    const companiesCol = getCollection<CompanyDoc>('company');
    return companiesCol.findOne({ company_id: scope.companyId });
  }

  static async updateUser(userId: string, update: Partial<UserDoc>): Promise<void> {
    const usersCol = getCollection<UserDoc>('user');
    await usersCol.updateOne({ _id: new ObjectId(userId) }, { $set: update });
  }

  static async updateCompany(scope: TenantScope, update: Partial<CompanyDoc>): Promise<void> {
    const companiesCol = getCollection<CompanyDoc>('company');
    await companiesCol.updateOne({ company_id: scope.companyId }, { $set: update });
  }
}
