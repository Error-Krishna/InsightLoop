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

  it('verifies all documentation files document VITE_API_BASE_URL ending with /api/v1 and VITE_WS_BASE_URL with no subpath', () => {
    const rootDir = path.resolve(__dirname, '../../..');
    const docsDir = path.resolve(rootDir, 'docs');

    function getMdFiles(dir: string): string[] {
      const mdFiles: string[] = [];
      if (!fs.existsSync(dir)) return mdFiles;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && !['node_modules', '.git', 'dist', 'build', '.venv'].includes(e.name)) {
          mdFiles.push(...getMdFiles(full));
        } else if (e.name.endsWith('.md')) {
          mdFiles.push(full);
        }
      }
      return mdFiles;
    }

    const allDocs = [...getMdFiles(docsDir), ...getMdFiles(rootDir).filter((f) => path.dirname(f) === rootDir)];
    const docErrors: string[] = [];

    for (const doc of allDocs) {
      const rel = path.relative(rootDir, doc);
      const content = fs.readFileSync(doc, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('VITE_API_BASE_URL')) {
          const match = line.match(/https?:\/\/[^\s`'"|)]+/);
          if (match) {
            const url = match[0];
            const hasApiV1 = url.endsWith('/api/v1') || url.endsWith('/api/v1/');
            if (!hasApiV1) {
              docErrors.push(`${rel}:${idx + 1}: VITE_API_BASE_URL must end with /api/v1 (found: ${url})`);
            }
          }
        }
        if (line.includes('VITE_WS_BASE_URL')) {
          const match = line.match(/wss?:\/\/[^\s`'"|)]+/);
          if (match) {
            const url = match[0];
            const urlObj = new URL(url.replace(/^ws/, 'http'));
            if (urlObj.pathname && urlObj.pathname !== '/') {
              docErrors.push(`${rel}:${idx + 1}: VITE_WS_BASE_URL must have no subpath (found: ${url})`);
            }
          }
        }
      });
    }

    expect(docErrors).toEqual([]);
  });
});
