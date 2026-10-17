import { ObjectId, type Document } from 'mongodb';
import { getCollection } from '../../db/mongo.js';

export interface ContactMessageDoc extends Document {
  _id: ObjectId;
  name: string;
  email: string;
  message: string;
  created_at: Date;
}

export class ContactRepository {
  static async insertMessage(doc: Omit<ContactMessageDoc, '_id'>): Promise<ObjectId> {
    const col = getCollection<ContactMessageDoc>('contact_message');
    const res = await col.insertOne(doc as ContactMessageDoc);
    return res.insertedId;
  }

  static async findRecentMessages(limit = 10): Promise<ContactMessageDoc[]> {
    const col = getCollection<ContactMessageDoc>('contact_message');
    return col.find().sort({ created_at: -1 }).limit(limit).toArray();
  }
}
