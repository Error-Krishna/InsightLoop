import { getDb } from '../../db/mongo.js';

export class HealthRepository {
  static async pingMongo(): Promise<boolean> {
    try {
      const db = getDb();
      await db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
