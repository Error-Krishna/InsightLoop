import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  calcPercentageChange,
  calculateBillDerived,
  calculateBillTotals,
  calculateSuggestedProfit,
  roundCurrency,
  roundPy,
} from '../src/math.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VECTORS_PATH = path.resolve(
  __dirname,
  '../../../apps/api/test/contracts/fixtures/math_vectors.json'
);

describe('Mathematical Compatibility Engine', () => {
  it('passes 100,036 golden banker rounding test vectors with 0 mismatches', () => {
    const raw = fs.readFileSync(VECTORS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const roundingVectors = data.rounding;

    expect(roundingVectors.length).toBeGreaterThanOrEqual(100000);

    let failed = 0;
    for (let i = 0; i < roundingVectors.length; i++) {
      const { input, digits, expected } = roundingVectors[i];
      const actual = roundPy(input, digits);
      if (Math.abs(actual - expected) > 1e-9) {
        failed++;
      }
    }
    expect(failed).toBe(0);
  });

  it('matches Python bill derived calculations and profit logic', () => {
    const billTotals = calculateBillTotals(
      [
        { name: 'Desk', quantity: 2, rate: 5000, unit: 'pcs' },
        { name: 'Chair', quantity: 4, rate: 1200, unit: 'pcs' },
      ],
      500,
      18
    );

    expect(billTotals.subtotal).toBe(14800);
    expect(billTotals.discount).toBe(500);
    expect(billTotals.taxable_amount).toBe(14300);
    expect(billTotals.gst_amount).toBe(2574);
    expect(billTotals.grand_total).toBe(16874);

    const derived = calculateBillDerived(billTotals.grand_total, [{ amount: 10000 }], false);
    expect(derived.amount_received).toBe(10000);
    expect(derived.balance_due).toBe(6874);
    expect(derived.payment_status).toBe('partial');
    expect(derived.order_status).toBe('pending');

    const profit = calculateSuggestedProfit(10000, 8000, 16874);
    expect(profit.payment_fraction).toBe(0.5926);
    expect(profit.cost_basis_scaled).toBe(4741.02);
    expect(profit.suggested_profit).toBe(5258.98);
  });

  it('matches Python metric percentage change formulas', () => {
    expect(calcPercentageChange(150, 100)).toBe(50.0);
    expect(calcPercentageChange(50, 100)).toBe(-50.0);
    expect(calcPercentageChange(100, 0)).toBe(100.0);
    expect(calcPercentageChange(0, 0)).toBe(0.0);
  });
});
