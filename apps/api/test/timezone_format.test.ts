import { describe, it, expect } from 'vitest';
import { formatDjangoIso } from '../src/utils/timezone.js';

describe('formatDjangoIso Parity with Python Django naive isoformat()', () => {
  it('formats zero-millisecond Date without fractional part and without Z', () => {
    const dt = new Date('2030-12-31T00:00:00.000Z');
    expect(formatDjangoIso(dt)).toBe('2030-12-31T00:00:00');
  });

  it('formats non-zero millisecond Date with exactly 6 microsecond digits without Z', () => {
    const dt = new Date('2030-12-31T14:23:45.123Z');
    expect(formatDjangoIso(dt)).toBe('2030-12-31T14:23:45.123000');
  });

  it('formats non-zero single digit millisecond with 6 digits', () => {
    const dt = new Date('2030-12-31T08:05:09.007Z');
    expect(formatDjangoIso(dt)).toBe('2030-12-31T08:05:09.007000');
  });

  it('strips .000 and .000000 from string timestamps', () => {
    expect(formatDjangoIso('2030-12-31T00:00:00.000Z')).toBe('2030-12-31T00:00:00');
    expect(formatDjangoIso('2030-12-31T00:00:00.000')).toBe('2030-12-31T00:00:00');
    expect(formatDjangoIso('2030-12-31T00:00:00.000000Z')).toBe('2030-12-31T00:00:00');
  });

  it('preserves and pads sub-millisecond precision up to 6 microsecond digits', () => {
    expect(formatDjangoIso('2030-12-31T12:00:00.123456Z')).toBe('2030-12-31T12:00:00.123456');
    expect(formatDjangoIso('2030-12-31T12:00:00.5Z')).toBe('2030-12-31T12:00:00.500000');
  });

  it('preserves already naive strings without modification', () => {
    expect(formatDjangoIso('2030-12-31T00:00:00')).toBe('2030-12-31T00:00:00');
  });

  it('returns null for null, undefined, and invalid Date objects', () => {
    expect(formatDjangoIso(null)).toBeNull();
    expect(formatDjangoIso(undefined)).toBeNull();
    expect(formatDjangoIso(new Date('invalid-date'))).toBeNull();
  });
});
