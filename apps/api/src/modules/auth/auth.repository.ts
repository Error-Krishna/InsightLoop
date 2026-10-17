import { ObjectId, type Document } from 'mongodb';
import { getCollection } from '../../db/mongo.js';

export interface UserDoc extends Document {
  _id: ObjectId;
  name?: string;
  email: string;
  username?: string;
  password?: string;
  phone?: string;
  location?: string;
  profile_pic?: string;
  company?: ObjectId | string;
  company_id?: string;
  subscription?: string;
  notifications?: Record<string, boolean>;
  created_at?: Date;
  last_login?: Date;
}

export interface CompanyDoc extends Document {
  _id: ObjectId;
  company_id: string;
  name: string;
  business_type?: string;
  created_at?: Date;
  workspace_settings?: Record<string, boolean>;
  address?: string;
  email?: string;
  phone?: string;
  gst_number?: string;
  logo_url?: string;
  stamp_url?: string;
  signature_url?: string;
  bank_account_number?: string;
  ifsc_code?: string;
  bank_name?: string;
  branch_name?: string;
}

export class AuthRepository {
  static async findUserByEmail(email: string): Promise<UserDoc | null> {
    const usersCol = getCollection<UserDoc>('user');
    const sanitizedEmail = email.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return usersCol.findOne({
      // eslint-disable-next-line security/detect-non-literal-regexp -- reason: sanitizedEmail is escaped to prevent injection
      email: { $regex: new RegExp(`^${sanitizedEmail}$`, 'i') },
    });
  }

  static async findUserById(id: string | ObjectId): Promise<UserDoc | null> {
    const usersCol = getCollection<UserDoc>('user');
    const objId = typeof id === 'string' ? new ObjectId(id) : id;
    return usersCol.findOne({ _id: objId });
  }

  static async updateLastLogin(id: ObjectId): Promise<void> {
    const usersCol = getCollection<UserDoc>('user');
    await usersCol.updateOne({ _id: id }, { $set: { last_login: new Date() } });
  }

  static async findCompany(query: { _id?: ObjectId; company_id?: string }): Promise<CompanyDoc | null> {
    const companiesCol = getCollection<CompanyDoc>('company');
    return companiesCol.findOne(query);
  }

  static async createCompany(doc: Omit<CompanyDoc, '_id'>): Promise<ObjectId> {
    const companiesCol = getCollection<CompanyDoc>('company');
    const res = await companiesCol.insertOne(doc as CompanyDoc);
    return res.insertedId;
  }

  static async createUser(doc: Omit<UserDoc, '_id'>): Promise<ObjectId> {
    const usersCol = getCollection<UserDoc>('user');
    const res = await usersCol.insertOne(doc as UserDoc);
    return res.insertedId;
  }

  static async deleteCompanyById(id: ObjectId): Promise<void> {
    const companiesCol = getCollection<CompanyDoc>('company');
    await companiesCol.deleteOne({ _id: id });
  }
}
