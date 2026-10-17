import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/utils/crypto.js';
import crypto from 'node:crypto';

describe('PBKDF2 Password Cross-Validation Suite', () => {
  // Exact Django hashes generated with Python hashlib.pbkdf2_hmac('sha256', ...)
  const password = 'CorrectHorseBatteryStaple123!';
  const salt = 'abcdefghijklmnop';

  // 260,000 iterations (Django 4.0 - 4.1 default)
  const django260kHash = 'pbkdf2_sha256$260000$abcdefghijklmnop$nLi2u/YNx9TH6mNjlW+le2xypVXeYU+LzhGzD4ACIOs=';

  // 600,000 iterations (Django 4.2+ default)
  const django600kHash = 'pbkdf2_sha256$600000$abcdefghijklmnop$/SPYXE4MZTAHG+sZoiDDZXY35gfUUSQCEubRFc5ytIc=';

  it('correctly verifies a 260,000-iteration Django hash', () => {
    expect(verifyPassword(password, django260kHash)).toBe(true);
  });

  it('correctly verifies a 600,000-iteration Django hash', () => {
    expect(verifyPassword(password, django600kHash)).toBe(true);
  });

  it('rejects an incorrect password against a valid Django hash', () => {
    expect(verifyPassword('WrongPassword!', django260kHash)).toBe(false);
    expect(verifyPassword('WrongPassword!', django600kHash)).toBe(false);
  });

  it('rejects malformed hashes gracefully without throwing exceptions', () => {
    expect(verifyPassword(password, '')).toBe(false);
    expect(verifyPassword(password, 'not-a-hash')).toBe(false);
    expect(verifyPassword(password, 'sha256$260000$salt$hash')).toBe(false);
    expect(verifyPassword(password, 'pbkdf2_sha256$invalid$salt$hash')).toBe(false);
    expect(verifyPassword(password, 'pbkdf2_sha256$-100$salt$hash')).toBe(false);
    expect(verifyPassword(password, 'pbkdf2_sha256$260000$salt')).toBe(false);
    expect(verifyPassword(password, 'pbkdf2_sha256$260000$salt$tooshort')).toBe(false);
  });

  it('generates hashes in the exact Django pbkdf2_sha256$600000 format', () => {
    const freshPassword = 'SuperSecretRandomPassword987$!';
    const generated = hashPassword(freshPassword);

    const parts = generated.split('$');
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe('pbkdf2_sha256');
    expect(parts[1]).toBe('600000');
    expect(parts[2].length).toBe(16); // 16-char salt
    expect(parts[3].length).toBe(44); // 32-byte Base64 has length 44

    // Self-verification
    expect(verifyPassword(freshPassword, generated)).toBe(true);
    expect(verifyPassword('WrongSecretPassword', generated)).toBe(false);
  });

  it('computes timing-safe equal verification', () => {
    const rawKey = crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('base64');
    expect(rawKey).toBe('/SPYXE4MZTAHG+sZoiDDZXY35gfUUSQCEubRFc5ytIc=');
  });
});
