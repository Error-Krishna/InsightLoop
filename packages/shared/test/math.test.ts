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
let current = __dirname;
let VECTORS_PATH = '';
for (let i = 0; i < 10; i++) {
  const candidate = path.join(current, 'apps/api/test/contracts/fixtures/math_vectors.json');
  if (fs.existsSync(candidate)) {
    VECTORS_PATH = candidate;
    break;
  }
  current = path.dirname(current);
}

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
    const raw = fs.readFileSync(VECTORS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const derivedVectors = data.bill_derived_properties;

    for (const v of derivedVectors) {
      const derived = calculateBillDerived(v.grand_total, v.payments);
      expect(derived.amount_received).toBe(v.expected.amount_received);
      expect(derived.balance_due).toBe(v.expected.balance_due);
      expect(derived.over_received).toBe(v.expected.over_received);
      expect(derived.payment_status).toBe(v.expected.payment_status);
      expect(derived.payment_fraction).toBe(v.expected.payment_fraction);
    }

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

    const derived = calculateBillDerived(billTotals.grand_total, [{ amount: 10000 }], false, 'kacha');
    expect(derived.amount_received).toBe(10000);
    expect(derived.balance_due).toBe(6874);
    expect(derived.payment_status).toBe('partial');
    expect(derived.order_status).toBe('draft');

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
    expect(calcPercentageChange(-50, 0)).toBe(-100.0);
    expect(calcPercentageChange(0, 100)).toBe(-100.0);
    expect(calcPercentageChange(50, -100)).toBe(150.0);
  });

  it('covers all order_status state machine transitions and derived defaults', () => {
    // 1. Defaults when arguments omitted
    const def = calculateBillDerived(1000);
    expect(def.order_status).toBe('draft');
    expect(def.payment_status).toBe('unpaid');
    expect(def.balance_due).toBe(1000);

    // 2. profitConfirmed + paid -> closed
    const closed = calculateBillDerived(1000, [{ amount: 1000 }], true, 'pakka', false, []);
    expect(closed.order_status).toBe('closed');
    expect(closed.payment_status).toBe('paid');

    // 3. profitConfirmed + unpaid -> not closed
    const notClosed = calculateBillDerived(1000, [{ amount: 500 }], true, 'pakka', false, []);
    expect(notClosed.order_status).toBe('confirmed');

    // 4. shipmentConfirmed -> shipped
    const shipped = calculateBillDerived(1000, [], false, 'pakka', true, []);
    expect(shipped.order_status).toBe('shipped');

    // 5. kacha -> draft
    const kacha = calculateBillDerived(1000, [], false, 'kacha', false, []);
    expect(kacha.order_status).toBe('draft');

    // 6. pakka with 0 assignments -> confirmed
    const confirmed = calculateBillDerived(1000, [], false, 'pakka', false, []);
    expect(confirmed.order_status).toBe('confirmed');

    // 7. pakka with all assignments completed -> ready_to_ship
    const ready = calculateBillDerived(1000, [], false, 'pakka', false, [
      { status: 'completed' },
      { status: 'completed' },
    ]);
    expect(ready.order_status).toBe('ready_to_ship');

    // 8. pakka with any incomplete assignment -> in_production
    const inProd1 = calculateBillDerived(1000, [], false, 'pakka', false, [
      { status: 'completed' },
      { status: 'pending' },
    ]);
    expect(inProd1.order_status).toBe('in_production');

    const inProd2 = calculateBillDerived(1000, [], false, 'pakka', false, [
      { status: 'in_progress' },
    ]);
    expect(inProd2.order_status).toBe('in_production');
  });

  it('covers calculateBillTotals fallback fields and calculateSuggestedProfit boundaries', () => {
    // product_name fallback, unit fallback, description fallback, inventory_item_id fallback
    const totals = calculateBillTotals([
      { product_name: 'Fallback Item', quantity: 2, price: 100 },
      { name: 'Item 2', quantity: 1, unit_price: 50, unit: 'meters', description: 'Desc', inventory_item_id: 'inv-123' },
      { quantity: 0, rate: 0 },
    ]);

    expect(totals.products[0].name).toBe('Fallback Item');
    expect(totals.products[0].unit).toBe('pcs');
    expect(totals.products[0].description).toBe('');
    expect(totals.products[0].inventory_item_id).toBeNull();

    expect(totals.products[1].name).toBe('Item 2');
    expect(totals.products[1].unit).toBe('meters');
    expect(totals.products[1].description).toBe('Desc');
    expect(totals.products[1].inventory_item_id).toBe('inv-123');

    expect(totals.products[2].name).toBe('');

    // calculateSuggestedProfit when grandTotal is 0 or negative
    const zeroTotal = calculateSuggestedProfit(100, 50, 0);
    expect(zeroTotal.payment_fraction).toBe(0);
    expect(zeroTotal.cost_basis_scaled).toBe(0);
    expect(zeroTotal.suggested_profit).toBe(100);

    // calculateSuggestedProfit when revenueCollected > grandTotal (fraction clamped to 1.0)
    const overCollected = calculateSuggestedProfit(200, 50, 100);
    expect(overCollected.payment_fraction).toBe(1.0);
    expect(overCollected.cost_basis_scaled).toBe(50);
    expect(overCollected.suggested_profit).toBe(150);
  });
});
