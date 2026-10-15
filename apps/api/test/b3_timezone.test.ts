import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calcChange, getMonthBoundaries } from '../src/utils/timezone.js';
import { connectMongo, closeMongo, getDb } from '../src/db/mongo.js';
import { DashboardRepository } from '../src/modules/dashboard/dashboard.repository.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('B3: Timezone and Boundaries', () => {
  const scope: TenantScope = { companyId: 'test-b3-company-' + Date.now() };

  beforeAll(async () => {
    await connectMongo();
  });

  afterAll(async () => {
    const db = getDb();
    await db.collection('business_data').deleteMany({ company_id: scope.companyId });
    await closeMongo();
  });

  it('calcChange uses banker rounding (roundPy) matching Python round()', () => {
    // 200 -> 202.5 is +1.25%. Python round(1.25, 1) is 1.2
    expect(calcChange(200, 202.5)).toBe(1.2);

    // 400 -> 407 is +1.75%. Python round(1.75, 1) is 1.8
    expect(calcChange(400, 407)).toBe(1.8);

    expect(calcChange(0, 0)).toBe(0.0);
    expect(calcChange(0, 50)).toBe(100.0);
    expect(calcChange(0, -50)).toBe(-100.0);
  });

  it('computes month boundaries in Asia/Kolkata regardless of server TZ', () => {
    // 2026-10-31 20:00:00 UTC is 2026-11-01 01:30:00 in Asia/Kolkata (+05:30)
    const edgeDate = new Date('2026-10-31T20:00:00.000Z');

    const originalTz = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        const boundaries = getMonthBoundaries(edgeDate, 'Asia/Kolkata');

        // In Asia/Kolkata, this date is in November 2026!
        // currentMonthStart in UTC is 2026-10-31T18:30:00.000Z (2026-11-01 00:00:00 IST)
        expect(boundaries.currentMonthStart.toISOString()).toBe('2026-10-31T18:30:00.000Z');

        // prevMonthStart in UTC is 2026-09-30T18:30:00.000Z (2026-10-01 00:00:00 IST)
        expect(boundaries.prevMonthStart.toISOString()).toBe('2026-09-30T18:30:00.000Z');

        // prevMonthEnd in UTC is 2026-10-31T18:29:59.999Z (2026-10-31 23:59:59.999 IST)
        expect(boundaries.prevMonthEnd.toISOString()).toBe('2026-10-31T18:29:59.999Z');
      }
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('groups aggregation dates with timezone: "Asia/Kolkata"', async () => {
    const db = getDb();
    // Insert business data on 2026-10-31 20:00:00 UTC (which is 2026-11-01 01:30:00 IST)
    await db.collection('business_data').insertOne({
      company_id: scope.companyId,
      date: new Date('2026-10-31T20:00:00.000Z'),
      product: 'Boundary Item',
      category: 'Test',
      quantity: 1,
      production_cost: 10,
      selling_price: 20,
      region: 'North',
      customer_type: 'Retail',
    });

    const pipeline = [
      {
        $group: {
          _id: {
            year: { $year: { date: '$date', timezone: 'Asia/Kolkata' } },
            month: { $month: { date: '$date', timezone: 'Asia/Kolkata' } },
            day: { $dayOfMonth: { date: '$date', timezone: 'Asia/Kolkata' } },
          },
          count: { $sum: 1 },
        },
      },
    ];

    const results = await DashboardRepository.aggregateBusinessData<{
      _id: { year: number; month: number; day: number };
      count: number;
    }>(scope, pipeline);

    expect(results.length).toBe(1);
    // In Asia/Kolkata, the date is November 1, 2026! (In UTC it would have been October 31)
    expect(results[0]._id.year).toBe(2026);
    expect(results[0]._id.month).toBe(11);
    expect(results[0]._id.day).toBe(1);
  });
});
