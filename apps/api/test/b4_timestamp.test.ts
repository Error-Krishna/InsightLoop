import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { connectMongo, closeMongo, getDb } from '../src/db/mongo.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import { WorkersService } from '../src/modules/workers/workers.service.js';
import { formatDjangoIso } from '../src/utils/timezone.js';
import type { TenantScope } from '../src/types/tenant.js';

const rootDir = path.resolve(__dirname, '../../..');
const pythonBin = path.join(rootDir, '.venv/bin/python');

describe('B4: Timestamp Serialization', () => {
  const scope: TenantScope = { companyId: 'test-b4-company-' + Date.now() };
  let workerId: string;

  beforeAll(async () => {
    await connectMongo();
    const worker = await WorkersRepository.insertWorker(scope, {
      name: 'Timestamp Worker',
      phone: '5555555555',
      address: 'Clock Street',
      joining_date: new Date('2026-06-15T10:30:00.000Z'), // zero ms
      created_at: new Date('2026-06-15T10:30:00.458Z'), // 458 ms
      is_active: true,
    });
    workerId = worker._id.toString();
  });

  afterAll(async () => {
    const db = getDb();
    await db.collection('workers').deleteMany({ company_id: scope.companyId });
    await closeMongo();
  });

  it('formatDjangoIso produces naive ISO format matching Python datetime.isoformat()', () => {
    // 0 milliseconds -> no microsecond fraction, no Z
    const dateZeroMs = new Date('2026-10-15T14:30:00.000Z');
    expect(formatDjangoIso(dateZeroMs)).toBe('2026-10-15T14:30:00');

    // 458 milliseconds -> 6-digit microseconds (.458000), no Z
    const dateWithMs = new Date('2026-10-15T14:30:00.458Z');
    expect(formatDjangoIso(dateWithMs)).toBe('2026-10-15T14:30:00.458000');
  });

  it('Node response and Django capture for the same record produce identical timestamps', async () => {
    // Fetch via Node WorkersService
    const nodeWorker = await WorkersService.getWorker(scope, workerId);

    // Fetch via Django API view / serialize_value
    const djCapturedJson = execSync(
      `MONGODB_URI="mongodb://localhost:27017/InsightLoop_test" MONGODB_DB_NAME="InsightLoop_test" DJANGO_SECRET_KEY="test-secret-key-must-be-long-enough-32-chars" "${pythonBin}" -c "
import os, sys, django, json
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
import worker.models as wm
from insightloop.api_utils import serialize_value
from bson import ObjectId

w = wm.Worker.objects.get(id=ObjectId('${workerId}'))
data = {
    'joining_date': serialize_value(w.joining_date),
    'created_at': serialize_value(w.created_at),
}
print(json.dumps(data))
"`,
      { cwd: rootDir, encoding: 'utf-8' }
    ).trim();

    const djCaptured = JSON.parse(djCapturedJson);

    // Byte-for-byte exact equality between Node and Django serialized timestamps
    expect(nodeWorker.joining_date).toBe(djCaptured.joining_date);
    expect(nodeWorker.created_at).toBe(djCaptured.created_at);

    // Must not end with 'Z'
    expect(nodeWorker.joining_date?.endsWith('Z')).toBe(false);
    expect(nodeWorker.created_at?.endsWith('Z')).toBe(false);
  });
});
