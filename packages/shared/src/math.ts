import { Decimal } from 'decimal.js';
import { OrderStatus } from './constants.js';

// Configure Decimal.js to use Banker's Rounding (ROUND_HALF_EVEN)
Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Converts an IEEE-754 double precision float to its exact mathematical decimal representation.
 */
export function floatToExactDecimal(num: number): Decimal {
  if (!Number.isFinite(num)) {
    return new Decimal(num);
  }
  if (num === 0) {
    return new Decimal(0);
  }

  const buf = new ArrayBuffer(8);
  const f64 = new Float64Array(buf);
  const u64 = new BigUint64Array(buf);

  f64[0] = num;
  const bits = u64[0];

  const sign = bits >> 63n;
  const rawExponent = (bits >> 52n) & 0x7ffn;
  const rawMantissa = bits & 0xfffffffffffffn;

  let mantissa: bigint;
  let exponent: number;

  if (rawExponent === 0n) {
    mantissa = rawMantissa;
    exponent = 1 - 1023 - 52;
  } else {
    mantissa = rawMantissa | (1n << 52n);
    exponent = Number(rawExponent) - 1023 - 52;
  }

  let dec = new Decimal(mantissa.toString());
  if (exponent > 0) {
    dec = dec.mul(new Decimal(2).pow(exponent));
  } else if (exponent < 0) {
    dec = dec.div(new Decimal(2).pow(-exponent));
  }

  return sign === 1n ? dec.neg() : dec;
}

/**
 * Banker's rounding (round half to even).
 */
export function roundPy(val: number, n = 0): number {
  if (isNaN(val) || !isFinite(val)) return val;
  const d = floatToExactDecimal(val);
  if (n < 0) {
    const factor = new Decimal(10).pow(-n);
    const scaled = d.div(factor).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
    return scaled.mul(factor).toNumber();
  }
  const rounded = d.toDecimalPlaces(n, Decimal.ROUND_HALF_EVEN);
  return rounded.toNumber();
}

/**
 * Banker's rounding for currency (2 decimal places).
 */
export function roundCurrency(val: number): number {
  return roundPy(val, 2);
}

export interface BillProductInput {
  name?: string;
  product_name?: string;
  quantity?: number;
  rate?: number;
  price?: number;
  unit_price?: number;
  unit?: string;
  description?: string;
  inventory_item_id?: string | null;
  [key: string]: unknown;
}

export interface CalculatedProduct extends BillProductInput {
  name: string;
  quantity: number;
  rate: number;
  unit: string;
  description: string;
  total: number;
}

export interface BillTotals {
  products: CalculatedProduct[];
  subtotal: number;
  discount: number;
  taxable_amount: number;
  gst_percentage: number;
  gst_amount: number;
  grand_total: number;
}

/**
 * Calculates bill financial totals according to Indian GST conventions.
 */
export function calculateBillTotals(
  rawProducts: BillProductInput[],
  discount = 0,
  gstPercentage = 0
): BillTotals {
  let subtotal = 0;
  const products: CalculatedProduct[] = rawProducts.map(p => {
    const qty = p.quantity ?? 0;
    const rate = p.rate ?? p.price ?? p.unit_price ?? 0;
    const total = roundPy(qty * rate, 2);
    subtotal += total;
    return {
      ...p,
      name: (p.name ?? p.product_name) ?? '',
      quantity: qty,
      rate,
      unit: p.unit ?? 'pcs',
      description: p.description ?? '',
      inventory_item_id: p.inventory_item_id ?? null,
      total,
    };
  });

  subtotal = roundPy(subtotal, 2);
  const normDiscount = roundPy(Math.max(0, discount), 2);
  const taxable_amount = roundPy(Math.max(0, subtotal - normDiscount), 2);
  const normGstPct = roundPy(Math.max(0, gstPercentage), 2);
  const gst_amount = roundPy(taxable_amount * (normGstPct / 100), 2);
  const grand_total = roundPy(taxable_amount + gst_amount, 2);

  return {
    products,
    subtotal,
    discount: normDiscount,
    taxable_amount,
    gst_percentage: normGstPct,
    gst_amount,
    grand_total,
  };
}

export interface BillPaymentItem {
  amount: number;
  date?: string;
  notes?: string;
}

export interface BillLineProgress {
  ordered: number;
  produced?: number;
  shipped?: number;
}

export interface BillDerivedStatus {
  amount_received: number;
  balance_due: number;
  over_received: boolean;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_fraction: number;
  order_status: OrderStatus;
}

/**
 * Computes derived payment status and order status from bill financial state and line progress.
 */
export function calculateBillDerived(
  grandTotal: number,
  payments: BillPaymentItem[] = [],
  _profitConfirmed = false,
  _billType = 'kacha',
  shipmentConfirmed = false,
  assignments: { status: string }[] = [],
  lines: BillLineProgress[] = []
): BillDerivedStatus {
  let amount_received = 0;
  for (const p of payments) {
    amount_received += p.amount;
  }
  amount_received = roundPy(amount_received, 2);

  let balance_due: number;
  let payment_status: 'unpaid' | 'partial' | 'paid';
  let payment_fraction: number;

  if (grandTotal <= 0) {
    payment_status = 'paid';
    balance_due = 0;
    payment_fraction = 0.0;
  } else if (amount_received >= grandTotal) {
    balance_due = 0;
    payment_status = 'paid';
    payment_fraction = 1.0;
  } else if (amount_received > 0) {
    balance_due = roundPy(grandTotal - amount_received, 2);
    payment_status = 'partial';
    payment_fraction = roundPy(amount_received / grandTotal, 4);
  } else {
    balance_due = grandTotal;
    payment_status = 'unpaid';
    payment_fraction = 0.0;
  }

  const over_received = amount_received > grandTotal;

  const nonCancelledAssignments = assignments.filter((a) => a.status !== 'cancelled');
  const hasNonCancelledAssignment = nonCancelledAssignments.length > 0;

  const fullyShipped =
    Boolean(shipmentConfirmed) ||
    (lines.length > 0 && lines.every((l) => (l.shipped ?? 0) >= (l.ordered ?? 0) && (l.ordered ?? 0) > 0));

  const partiallyShipped = lines.length > 0 && lines.some((l) => (l.shipped ?? 0) > 0);

  const readyToShip =
    lines.length > 0
      ? lines.every((l) => (l.produced ?? 0) >= (l.ordered ?? 0) && (l.ordered ?? 0) > 0)
      : (nonCancelledAssignments.length > 0 && nonCancelledAssignments.every((a) => a.status === 'completed'));

  let order_status: OrderStatus;
  if (fullyShipped && payment_status === 'paid') {
    order_status = 'closed';
  } else if (fullyShipped) {
    order_status = 'shipped';
  } else if (partiallyShipped) {
    order_status = 'partially_shipped';
  } else if (readyToShip) {
    order_status = 'ready_to_ship';
  } else if (hasNonCancelledAssignment) {
    order_status = 'in_production';
  } else {
    order_status = 'confirmed';
  }

  return {
    amount_received,
    balance_due,
    over_received,
    payment_status,
    payment_fraction,
    order_status,
  };
}

/**
 * Computes suggested profit preview for a bill.
 */
export function calculateSuggestedProfit(
  revenueCollected: number,
  costBasisFull: number,
  grandTotal: number
) {
  const paymentFraction = grandTotal > 0 ? Math.min(1.0, revenueCollected / grandTotal) : 0;
  const costBasisScaled = roundPy(costBasisFull * paymentFraction, 2);
  const suggestedProfit = roundPy(revenueCollected - costBasisScaled, 2);

  return {
    payment_fraction: roundPy(paymentFraction, 4),
    cost_basis_scaled: costBasisScaled,
    suggested_profit: suggestedProfit,
  };
}

/**
 * Calculates metric percentage change between current and previous values.
 */
export function calcPercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    if (current > 0) return 100.0;
    if (current < 0) return -100.0;
    return 0.0;
  }
  return roundPy(((current - previous) / Math.abs(previous)) * 100, 1);
}
