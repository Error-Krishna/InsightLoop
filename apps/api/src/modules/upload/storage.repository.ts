import { GridFSBucket, type ObjectId } from 'mongodb';
import { getDb } from '../../db/mongo.js';

export class StorageRepository {
  static getBucket(bucketName = 'app_media'): GridFSBucket {
    const db = getDb();
    return new GridFSBucket(db, { bucketName });
  }

  static async findFile(bucketName: string, filename: string) {
    const db = getDb();
    return db.collection(`${bucketName}.files`).findOne({ filename });
  }

  static async findFiles(bucketName: string, filename: string) {
    const db = getDb();
    return db.collection(`${bucketName}.files`).find({ filename }).toArray();
  }

  static async countFiles(bucketName: string, filename: string): Promise<number> {
    const db = getDb();
    return db.collection(`${bucketName}.files`).countDocuments({ filename });
  }

  static async deleteFileById(bucketName: string, id: ObjectId): Promise<void> {
    const bucket = this.getBucket(bucketName);
    await bucket.delete(id);
  }
}
