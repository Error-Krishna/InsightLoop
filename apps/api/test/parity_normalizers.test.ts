import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface NormalizerRule {
  pattern: string;
  rule: string;
  regex: string;
  replacement: string;
  justification: string;
}

interface NormalizerConfig {
  description: string;
  rules: NormalizerRule[];
}

function loadNormalizers(): NormalizerConfig {
  const possiblePaths = [
    path.resolve(process.cwd(), 'scripts/parity_normalizers.json'),
    path.resolve(process.cwd(), '../../scripts/parity_normalizers.json'),
    path.resolve(__dirname, '../../../scripts/parity_normalizers.json'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  }
  throw new Error('parity_normalizers.json not found in search paths: ' + possiblePaths.join(', '));
}

function applyNormalizers(obj: any, currentPath = '', config: NormalizerConfig): any {
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

  if (Array.isArray(obj)) {
    return obj.map((item, idx) => applyNormalizers(item, `${currentPath}[${idx}]`, config));
  }

  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const childPath = currentPath ? `${currentPath}.${k}` : k;
      result[k] = applyNormalizers(v, childPath, config);
    }
    return result;
  }

  return obj;
}

describe('Parity Normalizers Whitelist Guardrails', () => {
  const config = loadNormalizers();

  it('contains valid rules each with a non-empty justification and regex', () => {
    expect(config.rules.length).toBeGreaterThan(0);
    for (const rule of config.rules) {
      expect(rule.pattern).toBeTruthy();
      expect(rule.rule).toBeTruthy();
      expect(rule.regex).toBeTruthy();
      expect(rule.replacement).toBeTruthy();
      expect(rule.justification).toBeTruthy();
      expect(rule.justification.length).toBeGreaterThan(15);
      // Ensure regex compiles
      expect(() => new RegExp(rule.regex)).not.toThrow();
      expect(() => new RegExp(rule.pattern)).not.toThrow();
    }
  });

  it('normalizes valid dynamic IDs, timestamps, and tokens on matching paths', () => {
    const payload = {
      _id: '507f1f77bcf86cd799439011',
      worker_id: '607f1f77bcf86cd799439022',
      invoice_number: 'INV-2026-00042',
      created_at: '2026-10-16T12:30:45',
      updated_at: '2026-10-16T12:30:45.123456',
      tokens: {
        access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakSecret',
      },
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    };

    const normalized = applyNormalizers(payload, '', config);
    expect(normalized._id).toBe('<OBJECT_ID>');
    expect(normalized.worker_id).toBe('<OBJECT_ID>');
    expect(normalized.invoice_number).toBe('<INVOICE_NUM>');
    expect(normalized.created_at).toBe('<TIMESTAMP_NOW>');
    expect(normalized.updated_at).toBe('<TIMESTAMP_NOW>');
    expect(normalized.tokens.access).toBe('<JWT_TOKEN>');
    expect(normalized.requestId).toBe('<UUID>');
  });

  it('CANNOT mask real numerical differences (no global float normalization)', () => {
    const django = { amount: 15.0, balance: 100.5, rate: 20.0 };
    const nodeDiff = { amount: 15.01, balance: 100.5, rate: 20.0 };

    const normDjango = applyNormalizers(django, '', config);
    const normNode = applyNormalizers(nodeDiff, '', config);

    expect(normDjango.amount).not.toEqual(normNode.amount);
    expect(normDjango.amount).toBe(15.0);
    expect(normNode.amount).toBe(15.01);
  });

  it('CANNOT mask business data fields even if formatted like IDs or dates', () => {
    const data = {
      name: '507f1f77bcf86cd799439011', // Name matches hex regex but path is "name"
      date: '2026-10-16T00:00:00', // Business date (not created_at/updated_at)
      quantity: 50,
      status: 'pending',
    };

    const normalized = applyNormalizers(data, '', config);
    // Neither name nor date should be replaced
    expect(normalized.name).toBe('507f1f77bcf86cd799439011');
    expect(normalized.date).toBe('2026-10-16T00:00:00');
    expect(normalized.quantity).toBe(50);
  });

  it('rejects timestamps with timezone offsets or trailing Z to enforce Django naive ISO format', () => {
    const withZ = { created_at: '2026-10-16T12:30:45Z' };
    const withOffset = { created_at: '2026-10-16T12:30:45+00:00' };

    const normZ = applyNormalizers(withZ, '', config);
    const normOffset = applyNormalizers(withOffset, '', config);

    // Should NOT match regex because Django naive format does not have Z or +00:00
    expect(normZ.created_at).toBe('2026-10-16T12:30:45Z');
    expect(normOffset.created_at).toBe('2026-10-16T12:30:45+00:00');
  });
});
