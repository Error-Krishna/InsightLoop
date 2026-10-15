import { roundPy } from '@insightloop/shared';
import { env } from '../config/env.js';

export function calcChange(oldVal: number, newVal: number): number {
  if (oldVal === 0 && newVal === 0) return 0.0;
  if (oldVal === 0) return newVal > 0 ? 100.0 : -100.0;
  return roundPy(((newVal - oldVal) / Math.abs(oldVal)) * 100, 1);
}

export function getZonedDateParts(date: Date, timeZone: string = env.APP_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => {
    const p = parts.find((pt) => pt.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  const rawHour = getPart('hour');
  return {
    year: getPart('year'),
    month: getPart('month'), // 1-12
    day: getPart('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: getPart('minute'),
    second: getPart('second'),
  };
}

export function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  timeZone: string = env.APP_TIME_ZONE
): Date {
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  const parts = getZonedDateParts(candidate, timeZone);
  const candidateLocal = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetDiff = candidateLocal - candidate.getTime();
  return new Date(candidate.getTime() - offsetDiff);
}

export function getMonthBoundaries(
  referenceDate: Date = new Date(),
  timeZone: string = env.APP_TIME_ZONE
) {
  const parts = getZonedDateParts(referenceDate, timeZone);
  const currentMonthStart = zonedDateToUtc(parts.year, parts.month, 1, 0, 0, 0, 0, timeZone);

  const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
  const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
  const prevMonthStart = zonedDateToUtc(prevYear, prevMonth, 1, 0, 0, 0, 0, timeZone);
  const prevMonthEnd = new Date(currentMonthStart.getTime() - 1);

  return {
    currentMonthStart,
    prevMonthStart,
    prevMonthEnd,
  };
}

export function buildZonedDateRange(
  months: number,
  referenceDate: Date = new Date(),
  timeZone: string = env.APP_TIME_ZONE
) {
  const parts = getZonedDateParts(referenceDate, timeZone);
  const endDt = zonedDateToUtc(parts.year, parts.month, parts.day, 23, 59, 59, 999, timeZone);
  const startCandidate = new Date(endDt.getTime() - months * 30 * 24 * 60 * 60 * 1000);
  const startParts = getZonedDateParts(startCandidate, timeZone);
  const startDt = zonedDateToUtc(startParts.year, startParts.month, startParts.day, 0, 0, 0, 0, timeZone);
  return { startDt, endDt };
}

export function formatDjangoIso(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const year = val.getUTCFullYear();
    const month = String(val.getUTCMonth() + 1).padStart(2, '0');
    const day = String(val.getUTCDate()).padStart(2, '0');
    const hours = String(val.getUTCHours()).padStart(2, '0');
    const minutes = String(val.getUTCMinutes()).padStart(2, '0');
    const seconds = String(val.getUTCSeconds()).padStart(2, '0');
    const ms = val.getUTCMilliseconds();

    const base = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    if (ms === 0) return base;
    return `${base}.${String(ms * 1000).padStart(6, '0')}`;
  }
  if (typeof val === 'string') {
    if (val.endsWith('Z') && val.includes('T')) {
      return val.slice(0, -1);
    }
    return val;
  }
  return String(val);
}

