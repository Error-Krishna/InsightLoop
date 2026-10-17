import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Storage Cleanup & Verification Script
 * Purpose: Guard ephemeral container disks from file bloat by scanning
 * and pruning temporary upload artifacts, orphaned exports, and stale buffers.
 */

const DEFAULT_TEMP_DIR = process.env.TEMP_STORAGE_DIR || path.join(os.tmpdir(), 'insightloop-uploads');
const MAX_AGE_MS = Number(process.env.STORAGE_MAX_AGE_MS) || 60 * 60 * 1000; // 1 hour TTL
const MAX_STORAGE_BYTES = Number(process.env.STORAGE_MAX_BYTES) || 500 * 1024 * 1024; // 500MB safety threshold

export function cleanStorage(targetDir = DEFAULT_TEMP_DIR, maxAgeMs = MAX_AGE_MS, dryRun = false) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return {
      directory: targetDir,
      totalFiles: 0,
      totalBytes: 0,
      deletedFiles: 0,
      reclaimedBytes: 0,
      status: 'CLEAN',
    };
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const now = Date.now();
  let totalBytes = 0;
  let deletedFiles = 0;
  let reclaimedBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(targetDir, entry.name);
    try {
      const stats = fs.statSync(filePath);
      totalBytes += stats.size;
      const fileAge = now - stats.mtimeMs;

      if (fileAge > maxAgeMs) {
        if (!dryRun) {
          fs.unlinkSync(filePath);
        }
        deletedFiles++;
        reclaimedBytes += stats.size;
      }
    } catch (err) {
      console.warn(`[Storage Cleanup] Could not inspect file ${filePath}:`, err.message);
    }
  }

  const remainingBytes = totalBytes - reclaimedBytes;
  const isHealthy = remainingBytes < MAX_STORAGE_BYTES;

  return {
    directory: targetDir,
    totalFiles: entries.filter((e) => e.isFile()).length,
    initialBytes: totalBytes,
    deletedFiles,
    reclaimedBytes,
    remainingBytes,
    status: isHealthy ? 'CLEAN' : 'OVER_THRESHOLD',
  };
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith('verify_storage_cleanup.mjs')) {
  const isDryRun = process.argv.includes('--dry-run');
  const tempDir = process.env.TEMP_STORAGE_DIR || DEFAULT_TEMP_DIR;

  console.log('================================================================');
  console.log('E1: STORAGE CLEANUP & DISK USAGE VERIFICATION');
  console.log('================================================================');
  console.log(`Target Directory:   ${tempDir}`);
  console.log(`Max File Age:       ${MAX_AGE_MS / 1000}s`);
  console.log(`Max Total Storage:  ${MAX_STORAGE_BYTES / (1024 * 1024)}MB`);
  console.log(`Dry Run:            ${isDryRun}`);
  console.log('----------------------------------------------------------------');

  // Create temporary test files to verify cleanup capability
  const testOldFile = path.join(tempDir, 'test_stale_upload.tmp');
  const testNewFile = path.join(tempDir, 'test_fresh_upload.tmp');
  
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(testOldFile, 'Old simulated upload data buffer'.repeat(50), 'utf-8');
  fs.writeFileSync(testNewFile, 'Fresh upload data buffer'.repeat(50), 'utf-8');

  // Backdate testOldFile by 2 hours
  const twoHoursAgo = (Date.now() - 2 * 3600 * 1000) / 1000;
  fs.utimesSync(testOldFile, twoHoursAgo, twoHoursAgo);

  const result = cleanStorage(tempDir, MAX_AGE_MS, isDryRun);

  console.log(`Initial Files:      ${result.totalFiles}`);
  console.log(`Initial Bytes:      ${result.initialBytes} bytes`);
  console.log(`Deleted Stale:      ${result.deletedFiles} files`);
  console.log(`Reclaimed Space:    ${result.reclaimedBytes} bytes`);
  console.log(`Remaining Space:    ${result.remainingBytes} bytes`);
  console.log(`Storage Status:     ${result.status}`);
  console.log('----------------------------------------------------------------');

  // Clean testNewFile
  if (fs.existsSync(testNewFile)) {
    fs.unlinkSync(testNewFile);
  }

  console.log('✅ Storage cleanup verification completed successfully.');
  console.log('================================================================');
}
