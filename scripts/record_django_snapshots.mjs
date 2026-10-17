/**
 * Capture static Django responses into fixtures/django_snapshots/
 * for offline snapshot parity verification without requiring Python/Django.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOTS_DIR = path.resolve(__dirname, '../fixtures/django_snapshots');

const DJANGO_URL = process.env.DJANGO_URL || 'http://127.0.0.1:8000';

async function main() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }

  // 1. Authenticate with Django
  const loginRes = await fetch(`${DJANGO_URL}/api/v1/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'alice@company-a.com',
      password: 'password123',
    }),
  });

  if (!loginRes.ok) {
    throw new Error(`Django login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json();
  const token = loginData.tokens.access;
  console.log(`[SNAPSHOTS] Authenticated with Django. Token obtained.`);

  // 2. Define endpoints to snapshot
  const endpoints = [
    {
      id: 'inventory_warehouses',
      description: 'List all warehouses for Company A',
      nodeEndpoint: '/api/v1/inventory/warehouses',
      djangoEndpoint: '/api/v1/inventory/warehouses/',
      method: 'GET',
    },
    {
      id: 'inventory_warehouse_summary',
      description: 'Warehouse summary breakdown across inventory types',
      nodeEndpoint: '/api/v1/inventory/meta/warehouse-summary',
      djangoEndpoint: '/api/v1/inventory/meta/warehouse-summary/',
      method: 'GET',
    },
    {
      id: 'inventory_finished',
      description: 'List finished goods inventory items',
      nodeEndpoint: '/api/v1/inventory/finished',
      djangoEndpoint: '/api/v1/inventory/finished/',
      method: 'GET',
    },
    {
      id: 'inventory_semi_finished',
      description: 'List semi-finished inventory items',
      nodeEndpoint: '/api/v1/inventory/semi-finished',
      djangoEndpoint: '/api/v1/inventory/semi-finished/',
      method: 'GET',
    },
    {
      id: 'inventory_semi_finished_live',
      description: 'Live semi-finished inventory with active worker calculations',
      nodeEndpoint: '/api/v1/inventory/semi-finished/live',
      djangoEndpoint: '/api/v1/inventory/semi-finished/live/',
      method: 'GET',
    },
    {
      id: 'inventory_raw',
      description: 'List raw materials inventory items',
      nodeEndpoint: '/api/v1/inventory/raw',
      djangoEndpoint: '/api/v1/inventory/raw/',
      method: 'GET',
    },
    {
      id: 'inventory_warehouse_invalid_id',
      description: 'Update warehouse with malformed ObjectId',
      nodeEndpoint: '/api/v1/inventory/warehouses/invalid_id',
      djangoEndpoint: '/api/v1/inventory/warehouses/invalid_id/',
      method: 'PUT',
      payload: { name: 'test' },
    },
    {
      id: 'inventory_warehouse_not_found',
      description: 'Update non-existent warehouse',
      nodeEndpoint: '/api/v1/inventory/warehouses/670d8a000000000000000099',
      djangoEndpoint: '/api/v1/inventory/warehouses/670d8a000000000000000099/',
      method: 'PUT',
      payload: { name: 'test' },
    },
    {
      id: 'inventory_finished_invalid_id',
      description: 'Update finished item with malformed ObjectId',
      nodeEndpoint: '/api/v1/inventory/finished/invalid_id',
      djangoEndpoint: '/api/v1/inventory/finished/invalid_id/',
      method: 'PUT',
      payload: { name: 'test' },
    },
    {
      id: 'inventory_finished_not_found',
      description: 'Update non-existent finished item',
      nodeEndpoint: '/api/v1/inventory/finished/670d8a000000000000000099',
      djangoEndpoint: '/api/v1/inventory/finished/670d8a000000000000000099/',
      method: 'PUT',
      payload: { name: 'test' },
    },
    {
      id: 'inventory_semi_finished_invalid_id',
      description: 'Update semi-finished item with malformed ObjectId',
      nodeEndpoint: '/api/v1/inventory/semi-finished/invalid_id',
      djangoEndpoint: '/api/v1/inventory/semi-finished/invalid_id/',
      method: 'PUT',
      payload: { name: 'test' },
    },
    {
      id: 'inventory_semi_finished_not_found',
      description: 'Update non-existent semi-finished item',
      nodeEndpoint: '/api/v1/inventory/semi-finished/670d8a000000000000000099',
      djangoEndpoint: '/api/v1/inventory/semi-finished/670d8a000000000000000099/',
      method: 'PUT',
      payload: { name: 'test' },
    },
    {
      id: 'inventory_raw_invalid_id',
      description: 'Update raw material with malformed ObjectId',
      nodeEndpoint: '/api/v1/inventory/raw/invalid_id',
      djangoEndpoint: '/api/v1/inventory/raw/invalid_id/',
      method: 'PUT',
      payload: { name: 'test' },
    },
    {
      id: 'inventory_raw_not_found',
      description: 'Update non-existent raw material',
      nodeEndpoint: '/api/v1/inventory/raw/670d8a000000000000000099',
      djangoEndpoint: '/api/v1/inventory/raw/670d8a000000000000000099/',
      method: 'PUT',
      payload: { name: 'test' },
    },
    {
      id: 'bills_list_pakka',
      description: 'List pakka bills for Company A',
      nodeEndpoint: '/api/v1/bills?type=pakka',
      djangoEndpoint: '/api/v1/bills/?type=pakka',
      method: 'GET',
    },
    {
      id: 'bills_list_kacha',
      description: 'List kacha bills for Company A',
      nodeEndpoint: '/api/v1/bills?type=kacha',
      djangoEndpoint: '/api/v1/bills/?type=kacha',
      method: 'GET',
    },
    {
      id: 'workers_list',
      description: 'List all workers for Company A',
      nodeEndpoint: '/api/v1/workers',
      djangoEndpoint: '/api/v1/workers/',
      method: 'GET',
    },
    {
      id: 'dashboard_summary',
      description: 'Dashboard aggregated metrics summary',
      nodeEndpoint: '/api/v1/dashboard/summary',
      djangoEndpoint: '/api/v1/dashboard/summary/',
      method: 'GET',
    },
  ];

  const index = [];

  for (const ep of endpoints) {
    const url = `${DJANGO_URL}${ep.djangoEndpoint}`;
    const opts = {
      method: ep.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    if (ep.payload) {
      opts.body = JSON.stringify(ep.payload);
    }
    const res = await fetch(url, opts);

    let body;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    const snapshot = {
      id: ep.id,
      description: ep.description,
      nodeEndpoint: ep.nodeEndpoint,
      djangoEndpoint: ep.djangoEndpoint,
      method: ep.method,
      status: res.status,
      body,
    };

    const filePath = path.join(SNAPSHOTS_DIR, `${ep.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + '\n');
    index.push({
      id: ep.id,
      description: ep.description,
      nodeEndpoint: ep.nodeEndpoint,
      method: ep.method,
      status: res.status,
      file: `${ep.id}.json`,
    });
    console.log(`[SNAPSHOT] Captured ${ep.id} (Status ${res.status})`);
  }

  const indexPath = path.join(SNAPSHOTS_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`[SNAPSHOTS] Wrote ${index.length} snapshots to ${SNAPSHOTS_DIR}`);
}

main().catch((err) => {
  console.error('[SNAPSHOTS-ERROR]', err);
  process.exit(1);
});
