import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ALLOWED_VITE_VARS = new Set([
  'VITE_API_BASE_URL',
  'VITE_WS_BASE_URL',
  'VITE_GOOGLE_CLIENT_ID',
]);

function getSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Web Environment Variable & URL Construction Safety', () => {
  const srcDir = path.resolve(__dirname, '../src');
  const files = getSourceFiles(srcDir);

  it('scans apps/web/src and verifies only declared Vercel environment variables are referenced', () => {
    const envRegex = /import\.meta\.env(?:\??\.([A-Za-z0-9_]+)|\[['"]([A-Za-z0-9_]+)['"]\])/g;
    const undeclaredRefs: Array<{ file: string; line: number; varName: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        let match;
        while ((match = envRegex.exec(line)) !== null) {
          const varName = match[1] || match[2];
          // Standard Vite built-in vars: MODE, BASE_URL, PROD, DEV, SSR
          const isStandardVite = ['MODE', 'BASE_URL', 'PROD', 'DEV', 'SSR'].includes(varName);
          if (!isStandardVite && !ALLOWED_VITE_VARS.has(varName)) {
            undeclaredRefs.push({
              file: path.relative(srcDir, file),
              line: idx + 1,
              varName,
            });
          }
        }
      });
    }

    expect(
      undeclaredRefs,
      `Found references to undeclared environment variables: ${JSON.stringify(undeclaredRefs)}`
    ).toEqual([]);
  });

  it('verifies obsolete VITE_API_URL is nowhere in apps/web/src', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toContain('VITE_API_URL');
    }
  });

  it('verifies that URL constructions in src/lib/api.ts and src/lib/ws.ts consume only allowed variables', () => {
    const apiFile = path.resolve(srcDir, 'lib/api.ts');
    const apiContent = fs.readFileSync(apiFile, 'utf-8');
    expect(apiContent).toContain('import.meta.env.VITE_API_BASE_URL');
    expect(apiContent).not.toContain('VITE_API_URL');

    const wsFile = path.resolve(srcDir, 'lib/ws.ts');
    const wsContent = fs.readFileSync(wsFile, 'utf-8');
    expect(wsContent).toContain('import.meta.env?.VITE_WS_BASE_URL');
    expect(wsContent).not.toContain('VITE_API_URL');
  });
});
