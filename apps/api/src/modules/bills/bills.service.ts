import { ObjectId, type Document } from 'mongodb';
import { BillsRepository, type BillDoc } from './bills.repository.js';
import type { MaterialAssignmentDoc } from '../workers/workers.repository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import {
  calculateBillDerived,
  calculateBillTotals,
  calculateSuggestedProfit,
  roundPy,
} from '@insightloop/shared';
import type { TenantScope } from '../../types/tenant.js';

export interface BillInput {
  bill_type?: string;
  discount?: number | string;
  gst_percentage?: number | string;
  gst_number?: string;
  buyer?: {
    name?: string;
    address?: string;
    gst_number?: string;
    phone?: string;
  };
  buyer_name?: string;
  buyer_address?: string;
  buyer_phone?: string;
  products?: {
    name: string;
    description?: string;
    quantity: number;
    rate: number;
    unit?: string;
    inventory_item_id?: string | null;
  }[];
  payments?: {
    amount: number;
    date?: string | Date;
    notes?: string;
  }[];
}

export interface PaymentInput {
  amount?: number | string;
  date?: string;
  notes?: string;
}

export interface CostInput {
  amount?: number | string;
  date?: string;
  notes?: string;
}

export interface ReadyToDeliverInput {
  inventory_item_id?: string;
  quantity?: number | string;
  notes?: string;
  date?: string;
}

export class BillsService {
  private static async serializeBill(bill: BillDoc, scope: TenantScope) {
    const grandTotal = Number(bill.grand_total) || 0;
    const payments = bill.payments ?? [];
    const profitConfirmed = Boolean(bill.profit_confirmed);

    let readyToDeliverQty = 0;
    if (Array.isArray(bill.ready_to_deliver)) {
      for (const r of bill.ready_to_deliver) {
        readyToDeliverQty += Number(r.quantity) || 0;
      }
    }

    const shipmentConfirmed = Boolean(bill.shipment_confirmed);
    const billIdStr = bill._id.toString();

    const [linkedPayRecords, linkedAssignments] = await Promise.all([
      BillsRepository.findLinkedPayRecords(scope, billIdStr, bill.worker_assignment_ids ?? []),
      BillsRepository.findLinkedAssignments(scope, billIdStr),
    ]);

    const derived = calculateBillDerived(
      grandTotal,
      payments.map((p) => ({
        amount: Number(p.amount) || 0,
        date: p.date instanceof Date ? p.date.toISOString() : (p.date ?? undefined),
        notes: p.notes,
      })),
      profitConfirmed,
      bill.bill_type ?? 'kacha',
      shipmentConfirmed,
      linkedAssignments.map((a: Document) => ({ status: String((a as { status?: unknown }).status ?? '') }))
    );

    let transportationCostTotal = 0;
    if (Array.isArray(bill.transportation_costs)) {
      for (const t of bill.transportation_costs) {
        transportationCostTotal += Number(t.amount) || 0;
      }
    }

    let miscCostTotal = 0;
    if (Array.isArray(bill.misc_costs)) {
      for (const m of bill.misc_costs) {
        miscCostTotal += Number(m.amount) || 0;
      }
    }

    let workerCostTotal = 0;
    for (const p of linkedPayRecords) {
      workerCostTotal += (Number(p.units_produced) || 0) * (Number(p.rate_per_unit) || 0);
    }

    const buyerRaw = bill.buyer ?? {};
    const buyer: Record<string, unknown> = {};
    if (buyerRaw.name !== undefined) buyer.name = buyerRaw.name;
    if (buyerRaw.address !== undefined) buyer.address = buyerRaw.address;
    if (buyerRaw.gst_number !== undefined) buyer.gst_number = buyerRaw.gst_number;
    if (buyerRaw.phone !== undefined) buyer.phone = buyerRaw.phone;

    return {
      id: billIdStr,
      company_id: bill.company_id,
      bill_type: bill.bill_type,
      buyer,
      products: (bill.products ?? []).map((p) => ({
        name: p.name,
        description: p.description ?? '',
        quantity: Number(p.quantity) || 0,
        rate: Number(p.rate) || 0,
        unit: p.unit ?? 'pcs',
        total: Number(p.total) || roundPy((Number(p.quantity) || 0) * (Number(p.rate) || 0), 2),
        inventory_item_id: p.inventory_item_id ?? null,
      })),
      subtotal: Number(bill.subtotal) || 0,
      gst_percentage: Number(bill.gst_percentage) || 0,
      gst_amount: Number(bill.gst_amount) || 0,
      discount: Number(bill.discount) || 0,
      grand_total: grandTotal,
      invoice_number: bill.invoice_number ?? '',
      payments: payments.map((p) => ({
        amount: Number(p.amount) || 0,
        date: p.date ? new Date(p.date).toISOString() : null,
        notes: p.notes ?? '',
      })),
      amount_received: derived.amount_received,
      balance_due: derived.balance_due,
      payment_status: derived.payment_status,
      over_received: derived.over_received,
      profit_confirmed: profitConfirmed,
      profit_suggested_amount:
        bill.profit_suggested_amount !== undefined && bill.profit_suggested_amount !== null
          ? Number(bill.profit_suggested_amount)
          : null,
      profit_confirmed_amount:
        bill.profit_confirmed_amount !== undefined && bill.profit_confirmed_amount !== null
          ? Number(bill.profit_confirmed_amount)
          : null,
      profit_confirmed_at: bill.profit_confirmed_at
        ? new Date(bill.profit_confirmed_at).toISOString()
        : null,
      worker_assignment_ids: bill.worker_assignment_ids ?? [],
      worker_cost_total: roundPy(workerCostTotal, 2),
      transportation_costs: (bill.transportation_costs ?? []).map((t) => ({
        amount: Number(t.amount) || 0,
        date: t.date ? new Date(t.date).toISOString() : null,
        notes: t.notes ?? '',
      })),
      transportation_cost_total: roundPy(transportationCostTotal, 2),
      misc_costs: (bill.misc_costs ?? []).map((m) => ({
        amount: Number(m.amount) || 0,
        date: m.date ? new Date(m.date).toISOString() : null,
        notes: m.notes ?? '',
      })),
      misc_cost_total: roundPy(miscCostTotal, 2),
      ready_to_deliver: (bill.ready_to_deliver ?? []).map((r) => ({
        inventory_item_id: r.inventory_item_id,
        item_name: r.item_name ?? '',
        quantity: Number(r.quantity) || 0,
        notes: r.notes ?? '',
        date: r.date ? new Date(r.date).toISOString() : null,
      })),
      ready_to_deliver_quantity: readyToDeliverQty,
      shipment_confirmed: shipmentConfirmed,
      shipment_confirmed_at: bill.shipment_confirmed_at
        ? new Date(bill.shipment_confirmed_at).toISOString()
        : null,
      order_status: derived.order_status,
      created_at: bill.created_at ? new Date(bill.created_at).toISOString() : null,
      updated_at: bill.updated_at ? new Date(bill.updated_at).toISOString() : null,
    };
  }

  static async listBills(scope: TenantScope, billType?: string) {
    const query: Record<string, unknown> = {};
    if (billType) {
      query.bill_type = billType;
    }

    const bills = await BillsRepository.findBills(scope, query);
    return Promise.all(bills.map((b) => this.serializeBill(b, scope)));
  }

  static async getBill(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');

    return this.serializeBill(bill, scope);
  }

  static async createBill(scope: TenantScope, billType: string, data: BillInput) {
    const rawProducts = data.products ?? [];
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      throw new ValidationError('At least one product is required.');
    }

    const discount = parseFloat(String(data.discount ?? 0)) || 0;
    const gstPercentage = billType === 'kacha' ? 0 : parseFloat(String(data.gst_percentage ?? 0)) || 0;

    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);
    const invoiceNumber = await BillsRepository.getNextInvoiceNumber(scope);
    const now = new Date();

    // Stock deduction for linked items
    for (const p of totals.products) {
      if (p.inventory_item_id && ObjectId.isValid(p.inventory_item_id)) {
        await BillsRepository.adjustInventoryStockById(scope, p.inventory_item_id, -p.quantity);
      }
    }

    const buyerInput = data.buyer ?? {};
    const buyer = {
      name: data.buyer_name ?? buyerInput.name ?? '',
      address: data.buyer_address ?? buyerInput.address ?? '',
      gst_number: data.gst_number ?? buyerInput.gst_number ?? null,
      phone: data.buyer_phone ?? buyerInput.phone ?? '',
    };

    const created = await BillsRepository.insertBill(scope, {
      bill_type: billType,
      buyer,
      products: totals.products,
      subtotal: totals.subtotal,
      gst_percentage: totals.gst_percentage,
      gst_amount: totals.gst_amount,
      discount: totals.discount,
      grand_total: totals.grand_total,
      invoice_number: invoiceNumber,
      payments: data.payments ?? [],
      profit_confirmed: false,
      worker_assignment_ids: [],
      transportation_costs: [],
      misc_costs: [],
      ready_to_deliver: [],
      shipment_confirmed: false,
      created_at: now,
      updated_at: now,
    });

    return this.serializeBill(created, scope);
  }

  static async updateBill(scope: TenantScope, id: string, data: BillInput) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const existing = await BillsRepository.findBillById(scope, id);
    if (!existing) throw new NotFoundError('Bill not found.');

    if (data.bill_type && data.bill_type !== existing.bill_type) {
      throw new ValidationError(
        'Bill type cannot be changed via update. Use the convert endpoint to turn a kacha bill into a pakka bill.'
      );
    }

    const rawProducts = data.products ?? existing.products ?? [];
    const discount = data.discount !== undefined ? parseFloat(String(data.discount)) || 0 : (existing.discount ?? 0);
    const gstPercentage =
      existing.bill_type === 'kacha'
        ? 0
        : data.gst_percentage !== undefined
        ? parseFloat(String(data.gst_percentage)) || 0
        : (existing.gst_percentage ?? 0);

    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);

    const updateDoc: Partial<BillDoc> = {
      buyer: data.buyer ?? existing.buyer,
      products: totals.products,
      subtotal: totals.subtotal,
      gst_percentage: totals.gst_percentage,
      gst_amount: totals.gst_amount,
      discount: totals.discount,
      grand_total: totals.grand_total,
      updated_at: new Date(),
    };

    const updated = await BillsRepository.updateBill(scope, id, updateDoc);
    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async deleteBill(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const existing = await BillsRepository.findBillById(scope, id);
    if (!existing) throw new NotFoundError('Bill not found.');

    // Restore stock for linked products
    if (Array.isArray(existing.products)) {
      for (const p of existing.products) {
        if (p.inventory_item_id && ObjectId.isValid(p.inventory_item_id)) {
          await BillsRepository.adjustInventoryStockById(scope, p.inventory_item_id, Number(p.quantity) || 0);
        }
      }
    }

    await BillsRepository.deleteBill(scope, id);
  }

  static async convertToPakka(scope: TenantScope, id: string, data: { gst_number?: string; gst_percentage?: number | string; products?: BillInput['products'] }) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');

    if (bill.bill_type === 'pakka') {
      throw new ValidationError('Bill is already a pakka (formal) bill.');
    }

    const gstNumber = (data.gst_number ?? '').trim();
    if (!gstNumber) throw new ValidationError('GST number is required to convert to pakka.');

    const gstPercentage = parseFloat(String(data.gst_percentage ?? 0)) || 0;
    const rawProducts = data.products ?? bill.products ?? [];
    const discount = bill.discount ?? 0;

    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);
    const newInvoiceNumber = await BillsRepository.getNextInvoiceNumber(scope);

    const buyer = {
      ...(bill.buyer ?? {}),
      gst_number: gstNumber,
    };

    const updated = await BillsRepository.updateBill(scope, id, {
      bill_type: 'pakka',
      invoice_number: newInvoiceNumber,
      buyer,
      products: totals.products,
      subtotal: totals.subtotal,
      gst_percentage: totals.gst_percentage,
      gst_amount: totals.gst_amount,
      discount: totals.discount,
      grand_total: totals.grand_total,
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async recordPayment(scope: TenantScope, id: string, data: PaymentInput) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');

    const amount = parseFloat(String(data.amount ?? 0)) || 0;
    if (amount <= 0) throw new ValidationError('Payment amount must be positive.');

    const payment = {
      amount,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: (data.notes ?? '').trim(),
    };

    const updated = await BillsRepository.updateBillRaw(scope, id, {
      $push: { payments: payment } as Document,
      $set: { updated_at: new Date() },
    });

    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async getProfitPreview(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');

    let materialCost = 0;
    const lines = [];

    for (const p of bill.products ?? []) {
      let unitCost = 0;
      let costKnown = false;
      if (p.inventory_item_id && ObjectId.isValid(p.inventory_item_id)) {
        const item = await BillsRepository.findInventoryItemById(scope, p.inventory_item_id);
        if (item) {
          unitCost = Number(item.cost_price) || 0;
          costKnown = true;
        }
      }
      const lineCost = roundPy((Number(p.quantity) || 0) * unitCost, 2);
      materialCost += lineCost;
      lines.push({
        inventory_item_id: p.inventory_item_id ?? null,
        name: p.name,
        quantity: Number(p.quantity) || 0,
        unit_cost: unitCost,
        line_cost: lineCost,
        cost_known: costKnown,
      });
    }

    materialCost = roundPy(materialCost, 2);

    let workerCost = 0;
    const linkedPayRecords = await BillsRepository.findLinkedPayRecords(
      scope,
      id,
      bill.worker_assignment_ids ?? []
    );

    for (const p of linkedPayRecords) {
      workerCost += (Number(p.units_produced) || 0) * (Number(p.rate_per_unit) || 0);
    }
    workerCost = roundPy(workerCost, 2);

    let transportationCost = 0;
    for (const t of bill.transportation_costs ?? []) {
      transportationCost += Number(t.amount) || 0;
    }
    transportationCost = roundPy(transportationCost, 2);

    let miscCost = 0;
    for (const m of bill.misc_costs ?? []) {
      miscCost += Number(m.amount) || 0;
    }
    miscCost = roundPy(miscCost, 2);

    const fullCostOfGoods = roundPy(materialCost + workerCost + transportationCost + miscCost, 2);

    let revenueCollected = 0;
    for (const p of bill.payments ?? []) {
      revenueCollected += Number(p.amount) || 0;
    }
    revenueCollected = roundPy(revenueCollected, 2);

    const grandTotal = Number(bill.grand_total) || 0;
    const profitCalc = calculateSuggestedProfit(revenueCollected, fullCostOfGoods, grandTotal);

    return {
      revenue_collected: revenueCollected,
      cost_breakdown: {
        material_cost: materialCost,
        worker_cost: workerCost,
        transportation_cost: transportationCost,
        misc_cost: miscCost,
      },
      cost_basis_full: fullCostOfGoods,
      payment_fraction: profitCalc.payment_fraction,
      cost_basis_scaled: profitCalc.cost_basis_scaled,
      suggested_profit: profitCalc.suggested_profit,
      lines,
    };
  }

  static async confirmProfit(scope: TenantScope, id: string, confirmedAmountOverride?: number) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const preview = await this.getProfitPreview(scope, id);
    const confirmedAmount =
      confirmedAmountOverride !== undefined && !isNaN(confirmedAmountOverride)
        ? confirmedAmountOverride
        : preview.suggested_profit;

    const updated = await BillsRepository.updateBill(scope, id, {
      profit_suggested_amount: preview.suggested_profit,
      profit_confirmed_amount: confirmedAmount,
      profit_confirmed: true,
      profit_confirmed_at: new Date(),
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async reopenProfit(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const updated = await BillsRepository.updateBill(scope, id, {
      profit_confirmed: false,
      profit_confirmed_amount: null,
      profit_confirmed_at: null,
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async addTransportationCost(scope: TenantScope, id: string, data: CostInput) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const amount = parseFloat(String(data.amount ?? 0)) || 0;
    if (amount <= 0) throw new ValidationError('Amount must be positive.');

    const entry = {
      amount,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: (data.notes ?? '').trim(),
    };

    const updated = await BillsRepository.updateBillRaw(scope, id, {
      $push: { transportation_costs: entry } as Document,
      $set: { updated_at: new Date() },
    });

    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async addMiscCost(scope: TenantScope, id: string, data: CostInput) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const amount = parseFloat(String(data.amount ?? 0)) || 0;
    if (amount <= 0) throw new ValidationError('Amount must be positive.');

    const entry = {
      amount,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: (data.notes ?? '').trim(),
    };

    const updated = await BillsRepository.updateBillRaw(scope, id, {
      $push: { misc_costs: entry } as Document,
      $set: { updated_at: new Date() },
    });

    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async addReadyToDeliver(scope: TenantScope, id: string, data: ReadyToDeliverInput) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');
    if (bill.shipment_confirmed) {
      throw new ValidationError('This order has already been marked shipped.');
    }

    const itemId = data.inventory_item_id;
    if (!itemId || !ObjectId.isValid(itemId)) {
      throw new ValidationError('Valid inventory_item_id required.');
    }

    const item = await BillsRepository.findInventoryItemById(scope, itemId);
    if (!item) {
      throw new NotFoundError('Inventory item not found.');
    }

    const qty = parseFloat(String(data.quantity ?? 0)) || 0;
    if (qty <= 0) throw new ValidationError('Quantity must be positive.');

    const entry = {
      inventory_item_id: itemId,
      item_name: (item.name as string) ?? '',
      quantity: qty,
      notes: (data.notes ?? '').trim(),
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    };

    const updated = await BillsRepository.updateBillRaw(scope, id, {
      $push: { ready_to_deliver: entry } as Document,
      $set: { updated_at: new Date() },
    });

    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async confirmShipment(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');

    if (Array.isArray(bill.ready_to_deliver)) {
      for (const r of bill.ready_to_deliver) {
        if (r.inventory_item_id && ObjectId.isValid(r.inventory_item_id)) {
          await BillsRepository.adjustInventoryStockById(scope, r.inventory_item_id, -Number(r.quantity));
        }
      }
    }

    const updated = await BillsRepository.updateBill(scope, id, {
      shipment_confirmed: true,
      shipment_confirmed_at: new Date(),
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundError('Bill not found.');
    return this.serializeBill(updated, scope);
  }

  static async getBillAssignments(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');
    const assignments = await BillsRepository.findLinkedAssignments(scope, id);
    return assignments.map((item: MaterialAssignmentDoc) => {
      let deliveredQty = 0;
      if (Array.isArray(item.batches)) {
        for (const b of item.batches) deliveredQty += Number(b.quantity) || 0;
      }
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price_per_unit) || 0;
      const balanceQty = Math.max(0, qty - deliveredQty);
      const totalValue = roundPy(qty * price, 2);
      const workerId = (item.worker_id ?? (item.worker as { _id?: unknown })?._id ?? item.worker)?.toString();

      return {
        id: item._id.toString(),
        worker_id: workerId ?? null,
        material_name: item.material_name,
        quantity: qty,
        price_per_unit: price,
        assignment_date: item.assignment_date ? new Date(item.assignment_date).toISOString() : null,
        notes: item.notes ?? '',
        batches: (item.batches ?? []).map((b) => ({
          ...b,
          quantity: Number(b.quantity) || 0,
          date: b.date ? new Date(b.date).toISOString() : null,
        })),
        delivered_quantity: deliveredQty,
        balance_quantity: balanceQty,
        total_value: totalValue,
        status: item.status || 'open',
        completed_at: item.completed_at ? new Date(item.completed_at).toISOString() : null,
        wastage_quantity:
          item.wastage_quantity !== undefined && item.wastage_quantity !== null
            ? Number(item.wastage_quantity)
            : null,
        over_returned: deliveredQty > qty,
        bill_id: item.bill_id ?? null,
        wage_amount: Number(item.wage_amount) || 0,
        pay_record_id: item.pay_record_id ?? null,
      };
    });
  }
}

