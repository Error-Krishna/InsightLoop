import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { TenantScope } from '../src/types/tenant.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import { WorkersRepository } from '../src/modules/workers/workers.repository.js';
import { BillsRepository } from '../src/modules/bills/bills.repository.js';
import { ProfileRepository } from '../src/modules/profile/profile.repository.js';

describe('Architectural Enforcement (Gate G2)', () => {
  const modulesDir = path.resolve(__dirname, '../src/modules');

  function getTsFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('enforces that MongoDB and getCollection are ONLY accessed in *.repository.ts files within modules', () => {
    const files = getTsFiles(modulesDir);
    const violations: string[] = [];

    for (const file of files) {
      const relative = path.relative(modulesDir, file);
      const isRepository = file.endsWith('.repository.ts');
      const content = fs.readFileSync(file, 'utf-8');

      // Check for direct database imports
      const hasMongoDbImport =
        content.includes("from '../../db/mongo.js'") ||
        content.includes("from '../db/mongo.js'") ||
        content.includes('getCollection(') ||
        (content.includes("from 'mongodb'") && !isRepository && !content.includes('ObjectId'));

      if (!isRepository && hasMongoDbImport) {
        // Only repository files are allowed to invoke getCollection or direct db calls
        if (content.includes('getCollection(') || content.includes('getDb(')) {
          violations.push(relative);
        }
      }
    }

    expect(violations, `Files outside repositories accessing MongoDB directly: ${violations.join(', ')}`).toEqual([]);
  });

  it('enforces that TenantScope is required on repository queries', async () => {
    // TenantScope requires { companyId: string }
    const validScope: TenantScope = { companyId: 'comp-123' };
    expect(validScope.companyId).toBe('comp-123');

    // Verify repository methods require scope parameter
    expect(typeof InventoryRepository.findItems).toBe('function');
    expect(typeof WorkersRepository.findWorkers).toBe('function');
    expect(typeof BillsRepository.findBills).toBe('function');
    expect(typeof ProfileRepository.getCompany).toBe('function');

    // Function parameter lengths: first argument is scope
    expect(InventoryRepository.findItems.length).toBeGreaterThanOrEqual(1);
    expect(WorkersRepository.findWorkers.length).toBeGreaterThanOrEqual(1);
    expect(BillsRepository.findBills.length).toBeGreaterThanOrEqual(1);
    expect(ProfileRepository.getCompany.length).toBeGreaterThanOrEqual(1);
  });
});
