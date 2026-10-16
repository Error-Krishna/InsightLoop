import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectMongo, closeMongo, getDb } from '../src/db/mongo.js';
import { StorageService, GridFSStorageDriver, S3StorageDriver } from '../src/modules/upload/storage.service.js';
import { app } from '../src/app.js';

describe('E1: Storage Abstraction Suite (GridFS fallback + S3 flag + Security)', () => {
  beforeAll(async () => {
    await connectMongo();
  });

  afterAll(async () => {
    // Cleanup any test files
    try {
      const db = getMongoDb();
      await db.collection('app_media.files').deleteMany({ filename: { $regex: /^test_/ } });
      await db.collection('app_media.chunks').deleteMany({});
    } catch {
      // ignore
    }
    await closeMongo();
  });

  it('uploads, exists, reads, and deletes a file via GridFS storage driver', async () => {
    const driver = new GridFSStorageDriver();
    const testFilename = `test_gridfs_${Date.now()}.txt`;
    const content = Buffer.from('InsightLoop GridFS file persistence test', 'utf-8');

    const url = await driver.save(testFilename, content, 'text/plain');
    expect(url).toBe(`/media/${testFilename}`);

    const exists = await driver.exists(testFilename);
    expect(exists).toBe(true);

    const readBuf = await driver.read(testFilename);
    expect(readBuf).not.toBeNull();
    expect(readBuf!.toString('utf-8')).toBe('InsightLoop GridFS file persistence test');

    const deleted = await driver.delete(testFilename);
    expect(deleted).toBe(true);

    const existsAfter = await driver.exists(testFilename);
    expect(existsAfter).toBe(false);
  });

  it('preserves files across simulated server / container restart (restart-survives-restart)', async () => {
    const testFilename = `test_restart_${Date.now()}.png`;
    const testData = Buffer.from('FAKE_PNG_BINARY_DATA_THAT_SURVIVES_CONTAINER_REBOOT', 'utf-8');

    // First process writes to GridFS
    const driver1 = new GridFSStorageDriver();
    await driver1.save(testFilename, testData, 'image/png');

    // Simulate complete process crash / container reboot by creating a brand-new driver instance
    const rebootedDriver = new GridFSStorageDriver();
    const retrievedData = await rebootedDriver.read(testFilename);

    expect(retrievedData).not.toBeNull();
    expect(retrievedData!.toString('utf-8')).toBe('FAKE_PNG_BINARY_DATA_THAT_SURVIVES_CONTAINER_REBOOT');

    // Cleanup
    await rebootedDriver.delete(testFilename);
  });

  it('handles export file workflow (CSV/PDF) saving and retrieval', async () => {
    const exportPath = `exports/comp_test/report_${Date.now()}.csv`;
    const csvContent = Buffer.from('date,product,revenue\n2026-10-15,Kacha,5000\n', 'utf-8');

    const url = await StorageService.save(exportPath, csvContent, 'text/csv');
    expect(url).toBe(`/media/${exportPath}`);

    const retrieved = await StorageService.read(exportPath);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.toString('utf-8')).toBe('date,product,revenue\n2026-10-15,Kacha,5000\n');

    await StorageService.delete(exportPath);
  });

  it('strictly rejects path traversal attempts with ../ or invalid characters', async () => {
    const maliciousPaths = [
      '../etc/passwd',
      '../../secret.env',
      'profile/../../config.json',
      '..\\windows\\win.ini',
      '/etc/shadow',
      'test\0nullbyte.txt',
    ];

    for (const p of maliciousPaths) {
      await expect(
        StorageService.save(p, Buffer.from('malicious', 'utf-8'), 'text/plain')
      ).rejects.toThrow(/Invalid or insecure file path/);

      await expect(StorageService.read(p)).rejects.toThrow(/Invalid or insecure file path/);
    }
  });

  it('serves files over HTTP GET /media/* and blocks path traversal', async () => {
    const publicPath = `profile/test_user/avatar_${Date.now()}.txt`;
    await StorageService.save(publicPath, Buffer.from('public avatar data', 'utf-8'), 'text/plain');

    // Valid download
    const res = await request(app).get(`/media/${publicPath}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toBe('public avatar data');

    // Non-existent file
    const res404 = await request(app).get('/media/nonexistent_file_12345.txt');
    expect(res404.status).toBe(404);

    // Path traversal over HTTP
    const resBad = await request(app).get('/media/..%2f..%2fpackage.json');
    expect(resBad.status).toBe(400);

    // Cleanup
    await StorageService.delete(publicPath);
  });

  it('supports S3StorageDriver configuration and falls back to GridFS if S3 is unconfigured', async () => {
    const s3Driver = new S3StorageDriver();
    // In local test without AWS credentials, S3 driver gracefully falls back to GridFS
    const testFilename = `test_s3_fallback_${Date.now()}.txt`;
    const url = await s3Driver.save(testFilename, Buffer.from('s3 fallback test', 'utf-8'), 'text/plain');

    expect(url).toBe(`/media/${testFilename}`);
    const data = await s3Driver.read(testFilename);
    expect(data!.toString('utf-8')).toBe('s3 fallback test');

    await s3Driver.delete(testFilename);
  });
});
