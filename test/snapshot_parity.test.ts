import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../apps/api/src/app.js';
import { setupTestDb, teardownTestDb, getTestDbUri } from '../apps/api/test/testHelper.js';
import { seed } from '../scripts/seed.js';

interface SnapshotIndexItem {
  id: string;
  description: string;
  nodeEndpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  status: number;
  file: string;
}

interface SnapshotFile {
  id: string;
  description: string;
  nodeEndpoint: string;
  djangoEndpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  status: number;
  payload?: Record<string, unknown>;
  body: unknown;
}

interface NormalizerRule {
  pattern: string;
  rule: string;
  regex: string;
  replacement: string;
  justification: string;
}

interface NormalizersConfig {
  rules: NormalizerRule[];
}

function loadNormalizers(): NormalizersConfig {
  const normPath = path.resolve(__dirname, '../scripts/parity_normalizers.json');
  return JSON.parse(fs.readFileSync(normPath, 'utf8'));
}

function applyWhitelistNormalizer(obj: unknown, config: NormalizersConfig, currentPath = ''): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    for (const rule of config.rules) {
      const pathRegex = new RegExp(rule.pattern);
      if (pathRegex.test(currentPath)) {
        const valRegex = new RegExp(rule.regex);
        if (valRegex.test(obj)) {
          return rule.replacement;
        }
      }
    }
    return obj;
  }

  if (typeof obj === 'number') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item, idx) => applyWhitelistNormalizer(item, config, `${currentPath}[${idx}]`));
  }

  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
      const childPath = currentPath ? `${currentPath}.${k}` : k;
      sorted[k] = applyWhitelistNormalizer((obj as Record<string, unknown>)[k], config, childPath);
    }
    return sorted;
  }

  return obj;
}

function deepDiff(a: unknown, b: unknown, currentPath = ''): { path: string; expected: unknown; actual: unknown }[] {
  const diffs: { path: string; expected: unknown; actual: unknown }[] = [];
  if (a === b) return diffs;

  if (typeof a !== typeof b || a === null || b === null) {
    diffs.push({ path: currentPath || 'root', expected: a, actual: b });
    return diffs;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push({ path: `${currentPath}.length`, expected: a.length, actual: b.length });
    }
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      diffs.push(...deepDiff(a[i], b[i], `${currentPath}[${i}]`));
    }
    return diffs;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = Array.from(new Set([...Object.keys(aObj), ...Object.keys(bObj)])).sort();
    for (const key of allKeys) {
      const p = currentPath ? `${currentPath}.${key}` : key;
      if (!(key in aObj)) {
        diffs.push({ path: p, expected: undefined, actual: bObj[key] });
      } else if (!(key in bObj)) {
        diffs.push({ path: p, expected: aObj[key], actual: undefined });
      } else {
        diffs.push(...deepDiff(aObj[key], bObj[key], p));
      }
    }
    return diffs;
  }

  diffs.push({ path: currentPath || 'root', expected: a, actual: b });
  return diffs;
}

describe('Snapshot Parity Suite (Python-Free Safety Net 5: Fast Offline Parity)', () => {
  let token: string;
  let normalizersConfig: NormalizersConfig;
  let snapshots: { meta: SnapshotIndexItem; data: SnapshotFile }[];

  beforeAll(async () => {
    await setupTestDb();
    const uri = getTestDbUri();
    await seed(uri ?? undefined, 'InsightLoop_test');

    normalizersConfig = loadNormalizers();

    // Authenticate as Alice on Node Express app
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@company-a.com', password: 'password123' });
    expect(loginRes.status).toBe(200);
    token = loginRes.body.tokens.access;

    const snapshotsDir = path.resolve(__dirname, '../fixtures/django_snapshots');
    const indexPath = path.join(snapshotsDir, 'index.json');
    expect(fs.existsSync(indexPath), `Snapshot index not found at ${indexPath}`).toBe(true);

    const indexItems: SnapshotIndexItem[] = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(indexItems.length).toBeGreaterThanOrEqual(15);

    snapshots = indexItems.map((meta) => {
      const data: SnapshotFile = JSON.parse(fs.readFileSync(path.join(snapshotsDir, meta.file), 'utf8'));
      return { meta, data };
    });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('loads all static Django snapshots from fixtures/django_snapshots', () => {
    expect(snapshots.length).toBeGreaterThanOrEqual(15);
  });

  it('matches Node API responses to frozen Django snapshots with 0 diff', async () => {
    for (const { meta, data } of snapshots) {
      let req = request(app)[meta.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](meta.nodeEndpoint)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json');

      if (data.payload) {
        req = req.send(data.payload);
      }

      const res = await req;

      expect(
        res.status,
        `Snapshot [${meta.id}] (${meta.description}) expected status ${meta.status}, got ${res.status}: ${JSON.stringify(res.body)}`
      ).toBe(meta.status);

      const normDjango = applyWhitelistNormalizer(data.body, normalizersConfig);
      const normNode = applyWhitelistNormalizer(res.body, normalizersConfig);

      const rawDiffs = deepDiff(normDjango, normNode);
      const significantDiffs = rawDiffs.filter(
        (d) => d.path !== 'code' && d.path !== 'requestId' && !d.path.startsWith('requestId')
      );
      expect(
        significantDiffs.length,
        `Snapshot [${meta.id}] (${meta.description}) produced diffs against Django snapshot:\n${JSON.stringify(significantDiffs, null, 2)}`
      ).toBe(0);
    }
  });
});
