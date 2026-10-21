import { ObjectId, type Document } from 'mongodb';
import { BillsRepository, type BillDoc } from './bills.repository.js';
import type { MaterialAssignmentDoc } from '../workers/workers.repository.js';
import { InventoryRepository, type InventoryItemDoc } from '../inventory/inventory.repository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import {
  calculateBillDerived,
  calculateBillTotals,
  calculateSuggestedProfit,
  roundPy,
} from '@insightloop/shared';
import { formatDjangoIso } from '../../utils/timezone.js';
import type { TenantScope } from '../../types/tenant.js';
import { BillPdfService } from './pdf.service.js';
import { WhatsAppService } from './whatsapp.service.js';

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

export interface ShipmentInput {
  items?: { product_name: string; quantity: number }[];
  ship_all?: boolean;
  date?: string;
  notes?: string;
}

export class BillsService {
  private static serializeBillSync(bill: BillDoc, linkedAssignments: Document[]) {
    const grandTotal = Number(bill.grand_total) || 0;
    const payments = bill.payments ?? [];
    const profitConfirmed = Boolean(bill.profit_confirmed);

    let readyToDeliverQty = 0;
    if (Array.isArray(bill.ready_to_deliver)) {
      for (const r of bill.ready_to_deliver) {
        readyToDeliverQty += Number(r.quantity) || 0;
      }
    }

    const shipments = Array.isArray(bill.shipments) ? bill.shipments : [];
    const nonCancelledAssignments = (linkedAssignments as MaterialAssignmentDoc[]).filter(
      (a) => a.status !== 'cancelled'
    );

    const lines = (bill.products ?? []).map((p) => {
      const pNameNorm = (p.name ?? '').trim().toLowerCase();
      const ordered = Number(p.quantity) || 0;

      let targeted = 0;
      let produced = 0;
      for (const a of nonCancelledAssignments) {
        if ((a.material_name ?? '').trim().toLowerCase() === pNameNorm) {
          targeted += Number(a.quantity) || 0;
          let delivered = 0;
          if (a.produced_quantity !== undefined && a.produced_quantity !== null) {
            delivered = Number(a.produced_quantity) || 0;
          } else if (Array.isArray(a.batches)) {
            for (const b of a.batches) delivered += Number(b.quantity) || 0;
          }
          produced += delivered;
        }
      }

      let shipped = 0;
      for (const s of shipments) {
        for (const item of s.items ?? []) {
          if ((item.product_name ?? '').trim().toLowerCase() === pNameNorm) {
            shipped += Number(item.quantity) || 0;
          }
        }
      }
      if (shipments.length === 0 && bill.shipment_confirmed) {
        shipped = ordered;
      }

      const ready_to_ship = Math.max(0, produced - shipped);

      return {
        name: p.name,
        unit: p.unit ?? 'pcs',
        ordered,
        targeted,
        produced,
        shipped,
        ready_to_ship,
      };
    });

    const allLinesShipped = lines.length > 0 && lines.every((l) => l.shipped >= l.ordered);
    const shipmentConfirmed = allLinesShipped || Boolean(bill.shipment_confirmed);

    let shipmentConfirmedAt = bill.shipment_confirmed_at;
    if (allLinesShipped && shipments.length > 0 && !shipmentConfirmedAt) {
      const lastShipment = shipments[shipments.length - 1];
      if (lastShipment?.date) {
        shipmentConfirmedAt = new Date(lastShipment.date);
      }
    }

    const billIdStr = bill._id.toString();

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
      linkedAssignments.map((a: Document) => ({ status: String((a as { status?: unknown }).status ?? '') })),
      lines,
      bill.workflow
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
    for (const a of linkedAssignments) {
      if (a.status === 'completed') {
        workerCostTotal += Number(a.wage_amount) || 0;
      }
    }

    const buyerRaw = bill.buyer ?? {};
    const buyer: Record<string, unknown> = {};
    if (buyerRaw.name !== undefined) buyer.name = buyerRaw.name;
    if (buyerRaw.address !== undefined) buyer.address = buyerRaw.address;
    if (buyerRaw.gst_number !== undefined) buyer.gst_number = buyerRaw.gst_number;
    if (buyerRaw.phone !== undefined) buyer.phone = buyerRaw.phone;

    const baseResult: Record<string, unknown> = {
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
        date: formatDjangoIso(p.date),
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
      profit_confirmed_at: formatDjangoIso(bill.profit_confirmed_at),
      worker_assignment_ids: bill.worker_assignment_ids ?? [],
      worker_cost_total: roundPy(workerCostTotal, 2),
      transportation_costs: (bill.transportation_costs ?? []).map((t) => ({
        amount: Number(t.amount) || 0,
        date: formatDjangoIso(t.date),
        notes: t.notes ?? '',
      })),
      transportation_cost_total: roundPy(transportationCostTotal, 2),
      misc_costs: (bill.misc_costs ?? []).map((m) => ({
        amount: Number(m.amount) || 0,
        date: formatDjangoIso(m.date),
        notes: m.notes ?? '',
      })),
      misc_cost_total: roundPy(miscCostTotal, 2),
      ready_to_deliver: (bill.ready_to_deliver ?? []).map((r) => ({
        inventory_item_id: r.inventory_item_id,
        item_name: r.item_name ?? '',
        quantity: Number(r.quantity) || 0,
        notes: r.notes ?? '',
        date: formatDjangoIso(r.date),
      })),
      ready_to_deliver_quantity: readyToDeliverQty,
      shipment_confirmed: shipmentConfirmed,
      shipment_confirmed_at: formatDjangoIso(shipmentConfirmedAt),
      order_status: derived.order_status,
      created_at: formatDjangoIso(bill.created_at),
      updated_at: formatDjangoIso(bill.updated_at),
    };

    if (bill.workflow === 'order_first' || shipments.length > 0) {
      if (bill.workflow === 'order_first') {
        baseResult.workflow = 'order_first';
        baseResult.lines = lines;
      }
      baseResult.shipments = shipments.map((s) => ({
        shipment_id: s.shipment_id,
        date: formatDjangoIso(s.date),
        notes: s.notes ?? '',
        items: (s.items ?? []).map((it) => ({
          product_name: it.product_name,
          quantity: Number(it.quantity) || 0,
          finished_item_id: it.finished_item_id,
        })),
      }));
    }

    return baseResult;
  }

  private static async serializeBill(bill: BillDoc, scope: TenantScope) {
    const billIdStr = bill._id.toString();
    const linkedAssignments = await BillsRepository.findLinkedAssignments(scope, billIdStr);
    return this.serializeBillSync(bill, linkedAssignments);
  }

  static async listBills(scope: TenantScope, billType?: string) {
    const query: Record<string, unknown> = {};
    if (billType) {
      query.bill_type = billType;
    }

    const bills = await BillsRepository.findBills(scope, query);
    if (bills.length === 0) return [];

    const billIds = bills.map((b) => b._id.toString());
    const allAssignments = await BillsRepository.findLinkedAssignmentsForBills(scope, billIds);

    const assignmentsByBill = new Map<string, MaterialAssignmentDoc[]>();
    for (const a of allAssignments) {
      const bId = a.bill_id ? String(a.bill_id) : null;
      if (bId) {
        if (!assignmentsByBill.has(bId)) assignmentsByBill.set(bId, []);
        assignmentsByBill.get(bId)!.push(a);
      }
    }

    return bills.map((b) => {
      const bIdStr = b._id.toString();
      const linkedAssigns = assignmentsByBill.get(bIdStr) ?? [];
      return this.serializeBillSync(b, linkedAssigns);
    });
  }

  static async getBill(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');

    return this.serializeBill(bill, scope);
  }

  private static getStockDeltas(products: { inventory_item_id?: string | null; quantity?: number | string }[]): Map<string, number> {
    const deltas = new Map<string, number>();
    for (const product of products) {
      const itemId = product.inventory_item_id ? String(product.inventory_item_id).trim() : null;
      if (!itemId || !ObjectId.isValid(itemId)) continue;
      const qty = Number(product.quantity) || 0;
      if (qty > 0) {
        deltas.set(itemId, (deltas.get(itemId) ?? 0) + qty);
      }
    }
    return deltas;
  }

  private static async validateStockAvailable(scope: TenantScope, deltas: Map<string, number>): Promise<void> {
    const shortages: string[] = [];
    for (const [itemId, requestedQty] of deltas.entries()) {
      const item = await BillsRepository.findInventoryItemById(scope, itemId);
      if (!item) continue;
      const available = Number(item.quantity) || 0;
      if (available < requestedQty) {
        const unit = (item.unit as string) ?? 'pcs';
        const reqStr = Number.isInteger(requestedQty) ? `${requestedQty}.0` : String(requestedQty);
        const availStr = Number.isInteger(available) ? `${available}.0` : String(available);
        shortages.push(`${item.name}: requested ${reqStr} ${unit}, only ${availStr} ${unit} in stock`);
      }
    }
    if (shortages.length > 0) {
      throw new ValidationError(`Insufficient stock: ${shortages.join('; ')}`);
    }
  }

  private static async applyStockDeductions(scope: TenantScope, deltas: Map<string, number>): Promise<{ itemId: string; qty: number }[]> {
    await this.validateStockAvailable(scope, deltas);

    const applied: { itemId: string; qty: number }[] = [];
    for (const [itemId, needed] of deltas.entries()) {
      const success = await BillsRepository.adjustInventoryStockConditional(scope, itemId, -needed, needed);
      if (!success) {
        for (const roll of applied) {
          await BillsRepository.adjustInventoryStockById(scope, roll.itemId, roll.qty);
        }
        const item = await BillsRepository.findInventoryItemById(scope, itemId);
        const available = item ? Number(item.quantity) || 0 : 0;
        const unit = (item?.unit as string) ?? 'pcs';
        const name = item ? (item.name as string) : 'Item';
        const neededStr = Number.isInteger(needed) ? `${needed}.0` : String(needed);
        const availStr = Number.isInteger(available) ? `${available}.0` : String(available);
        throw new ValidationError(`Insufficient stock: ${name}: requested ${neededStr} ${unit}, only ${availStr} ${unit} in stock`);
      }
      applied.push({ itemId, qty: needed });
    }
    return applied;
  }

  private static validateUniqueProductNames(products: { name?: string }[]): void {
    const seen = new Set<string>();
    for (const p of products) {
      const normalized = (p.name ?? '').trim().toLowerCase();
      if (!normalized) continue;
      if (seen.has(normalized)) {
        throw new ValidationError(`Duplicate product name in bill: "${(p.name ?? '').trim()}". Each product in a bill must have a unique name.`);
      }
      seen.add(normalized);
    }
  }

  static async createBill(scope: TenantScope, billType: string, data: BillInput) {
    const rawProducts = data.products ?? [];
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      throw new ValidationError('At least one product is required.');
    }

    const isLegacy = (data as { workflow?: string }).workflow === 'legacy';
    if (!isLegacy) {
      this.validateUniqueProductNames(rawProducts);
    }

    const discount = parseFloat(String(data.discount ?? 0)) || 0;
    const gstPercentage = billType === 'kacha' ? 0 : parseFloat(String(data.gst_percentage ?? 0)) || 0;

    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);
    const now = new Date();

    const buyerInput = data.buyer ?? {};
    const buyer = {
      name: data.buyer_name ?? buyerInput.name ?? '',
      address: data.buyer_address ?? buyerInput.address ?? '',
      gst_number: data.gst_number ?? buyerInput.gst_number ?? null,
      phone: data.buyer_phone ?? buyerInput.phone ?? '',
    };

    let appliedStock: { itemId: string; qty: number }[] = [];
    if (isLegacy) {
      const deltas = this.getStockDeltas(totals.products);
      appliedStock = await this.applyStockDeductions(scope, deltas);
    }

    // R1: New bills use workflow: 'order_first', products.inventory_item_id is stored as null,
    // and inventory is never read or written. Legacy bills retain items and deduction.
    const products = isLegacy
      ? totals.products
      : totals.products.map((p) => ({
          ...p,
          inventory_item_id: null,
        }));

    let created;
    try {
      created = await BillsRepository.insertBillWithRetry(scope, (invoiceNumber) => {
        const doc: Parameters<typeof BillsRepository.insertBillWithRetry>[1] extends (inv: string) => infer R ? R : never = {
          bill_type: billType,
          workflow: isLegacy ? undefined : 'order_first',
          buyer,
          products,
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
          shipments: [],
          shipment_confirmed: false,
          created_at: now,
          updated_at: now,
        };
        return doc;
      });
    } catch (err) {
      if (isLegacy) {
        for (const roll of appliedStock) {
          await BillsRepository.adjustInventoryStockById(scope, roll.itemId, roll.qty);
        }
      }
      throw err;
    }

    return await this.serializeBill(created, scope);
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

    if (existing.bill_type === 'pakka') {
      const incomingGstNumber =
        data.buyer?.gst_number !== undefined
          ? data.buyer.gst_number
          : (data.gst_number !== undefined ? data.gst_number : existing.buyer?.gst_number);
      const incomingGstPercentage =
        data.gst_percentage !== undefined ? data.gst_percentage : existing.gst_percentage;
      const missing: string[] = [];
      if (!incomingGstNumber) missing.push('GST number');
      if (incomingGstPercentage === undefined || incomingGstPercentage === null || incomingGstPercentage === '') {
        missing.push('GST percentage');
      }
      if (missing.length > 0) {
        throw new ValidationError(`Cannot update pakka bill: missing required field(s): ${missing.join(', ')}.`);
      }
    }

    const rawProducts = data.products ?? existing.products ?? [];
    if (existing.workflow === 'order_first') {
      this.validateUniqueProductNames(rawProducts);
    }

    const discount = data.discount !== undefined ? parseFloat(String(data.discount)) || 0 : (existing.discount ?? 0);
    const gstPercentage =
      existing.bill_type === 'kacha'
        ? 0
        : data.gst_percentage !== undefined
        ? parseFloat(String(data.gst_percentage)) || 0
        : (existing.gst_percentage ?? 0);

    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);

    if (existing.workflow === 'order_first') {
      // R11 Guards for order_first:
      // Cannot remove/rename a line that has non-cancelled assignments or shipments
      // Cannot lower a line quantity below max(targeted, shipped)
      const linkedAssignments = await BillsRepository.findLinkedAssignments(scope, id);
      const activeAssignments = linkedAssignments.filter((a) => a.status !== 'cancelled');
      const shipments = existing.shipments ?? [];

      const newProductMap = new Map<string, { quantity: number }>();
      for (const np of totals.products) {
        newProductMap.set(np.name.trim().toLowerCase(), { quantity: Number(np.quantity) || 0 });
      }

      for (const oldLine of existing.products ?? []) {
        const oldNorm = oldLine.name.trim().toLowerCase();
        let targeted = 0;
        for (const a of activeAssignments) {
          if ((a.material_name ?? '').trim().toLowerCase() === oldNorm) {
            targeted += Number(a.quantity) || 0;
          }
        }
        let shipped = 0;
        for (const s of shipments) {
          for (const item of s.items ?? []) {
            if ((item.product_name ?? '').trim().toLowerCase() === oldNorm) {
              shipped += Number(item.quantity) || 0;
            }
          }
        }

        const requiredMin = Math.max(targeted, shipped);
        const newLine = newProductMap.get(oldNorm);
        if (requiredMin > 0) {
          if (!newLine) {
            throw new ValidationError(
              `Cannot remove or rename product "${oldLine.name}": active worker assignments or shipments exist for this product.`
            );
          }
          if (newLine.quantity < requiredMin) {
            throw new ValidationError(
              `Cannot lower quantity for product "${oldLine.name}" below ${requiredMin} (already targeted/shipped).`
            );
          }
        }
      }

      const buyer = { ...(data.buyer ?? existing.buyer) };
      if (data.buyer_name !== undefined) buyer.name = data.buyer_name;
      if (data.buyer_phone !== undefined) buyer.phone = data.buyer_phone;
      if (data.buyer_address !== undefined) buyer.address = data.buyer_address;
      if (existing.bill_type === 'pakka') {
        const gstNum = data.gst_number ?? (data.buyer?.gst_number || existing.buyer?.gst_number);
        if (gstNum) {
          buyer.gst_number = gstNum;
        }
      }

      const updateDoc: Partial<BillDoc> = {
        buyer,
        products: totals.products.map((p) => ({ ...p, inventory_item_id: null })),
        subtotal: totals.subtotal,
        gst_percentage: totals.gst_percentage,
        gst_amount: totals.gst_amount,
        discount: totals.discount,
        grand_total: totals.grand_total,
        updated_at: new Date(),
      };

      const updated = await BillsRepository.updateBill(scope, id, updateDoc);
      if (!updated) throw new NotFoundError('Bill not found.');
      return await this.serializeBill(updated, scope);
    }

    // LEGACY PATH: exact stock deduct/restore behavior as today
    const oldDeltas = this.getStockDeltas(existing.products ?? []);
    const newDeltas = this.getStockDeltas(totals.products ?? []);

    const allItemIds = new Set([...oldDeltas.keys(), ...newDeltas.keys()]);
    const positiveNetDeltas = new Map<string, number>();
    const negativeNetDeltas = new Map<string, number>();

    for (const itemId of allItemIds) {
      const net = (newDeltas.get(itemId) ?? 0) - (oldDeltas.get(itemId) ?? 0);
      if (net > 0) {
        positiveNetDeltas.set(itemId, net);
      } else if (net < 0) {
        negativeNetDeltas.set(itemId, -net);
      }
    }

    // 1. Validate stock availability for positive net deltas
    if (positiveNetDeltas.size > 0) {
      await this.validateStockAvailable(scope, positiveNetDeltas);
    }

    // 2. Restore stock for items where quantity decreased
    for (const [itemId, qtyToRestore] of negativeNetDeltas.entries()) {
      await BillsRepository.adjustInventoryStockById(scope, itemId, qtyToRestore);
    }

    // 3. Atomically deduct stock for positive net deltas
    const appliedIncreases: { itemId: string; qty: number }[] = [];
    try {
      for (const [itemId, needed] of positiveNetDeltas.entries()) {
        const success = await BillsRepository.adjustInventoryStockConditional(scope, itemId, -needed, needed);
        if (!success) {
          const item = await BillsRepository.findInventoryItemById(scope, itemId);
          const available = item ? Number(item.quantity) || 0 : 0;
          const unit = (item?.unit as string) ?? 'pcs';
          const name = item ? (item.name as string) : 'Item';
          const neededStr = Number.isInteger(needed) ? `${needed}.0` : String(needed);
          const availStr = Number.isInteger(available) ? `${available}.0` : String(available);
          throw new ValidationError(`Insufficient stock: ${name}: requested ${neededStr} ${unit}, only ${availStr} ${unit} in stock`);
        }
        appliedIncreases.push({ itemId, qty: needed });
      }
    } catch (err) {
      for (const roll of appliedIncreases) {
        await BillsRepository.adjustInventoryStockById(scope, roll.itemId, roll.qty);
      }
      for (const [itemId, qtyToRestore] of negativeNetDeltas.entries()) {
        await BillsRepository.adjustInventoryStockById(scope, itemId, -qtyToRestore);
      }
      throw err;
    }

    const buyer = { ...(data.buyer ?? existing.buyer) };
    if (existing.bill_type === 'pakka') {
      const gstNum = data.gst_number ?? (data.buyer?.gst_number || existing.buyer?.gst_number);
      if (gstNum) {
        buyer.gst_number = gstNum;
      }
    }

    const updateDoc: Partial<BillDoc> = {
      buyer,
      products: totals.products,
      subtotal: totals.subtotal,
      gst_percentage: totals.gst_percentage,
      gst_amount: totals.gst_amount,
      discount: totals.discount,
      grand_total: totals.grand_total,
      updated_at: new Date(),
    };

    try {
      const updated = await BillsRepository.updateBill(scope, id, updateDoc);
      if (!updated) throw new NotFoundError('Bill not found.');
      return await this.serializeBill(updated, scope);
    } catch (err) {
      for (const roll of appliedIncreases) {
        await BillsRepository.adjustInventoryStockById(scope, roll.itemId, roll.qty);
      }
      for (const [itemId, qtyToRestore] of negativeNetDeltas.entries()) {
        await BillsRepository.adjustInventoryStockById(scope, itemId, -qtyToRestore);
      }
      throw err;
    }
  }

  static async deleteBill(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const existing = await BillsRepository.findBillById(scope, id);
    if (!existing) throw new NotFoundError('Bill not found.');

    if (existing.workflow === 'order_first') {
      // R11 Guard: delete bill blocked (400) if any non-cancelled assignment or any shipment exists
      const linkedAssignments = await BillsRepository.findLinkedAssignments(scope, id);
      const activeAssignments = linkedAssignments.filter((a) => a.status !== 'cancelled');
      const shipments = existing.shipments ?? [];
      if (activeAssignments.length > 0 || shipments.length > 0) {
        throw new ValidationError('Cannot delete order: non-cancelled worker assignments or shipments exist for this order.');
      }

      await BillsRepository.deleteBill(scope, id);
      return;
    }

    // LEGACY PATH: restore stock
    const deleted = await BillsRepository.deleteBill(scope, id);
    if (deleted) {
      const deltas = this.getStockDeltas(existing.products ?? []);
      for (const [itemId, qty] of deltas.entries()) {
        await BillsRepository.adjustInventoryStockById(scope, itemId, qty);
      }
    }
  }

  static async convertToPakka(
    scope: TenantScope,
    id: string,
    data: { gst_number?: string; gst_percentage?: number | string; products?: BillInput['products'] }
  ) {
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
    if (bill.workflow === 'order_first') {
      this.validateUniqueProductNames(rawProducts);
    }

    const discount = bill.discount ?? 0;
    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);

    if (bill.workflow === 'order_first') {
      // R1: order_first bills never read or write inventory
      const buyer = {
        ...(bill.buyer ?? {}),
        gst_number: gstNumber,
      };

      let updated: BillDoc | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const newInvoiceNumber = await BillsRepository.getNextInvoiceNumber(scope, attempt > 0);
        try {
          updated = await BillsRepository.updateBill(scope, id, {
            bill_type: 'pakka',
            invoice_number: newInvoiceNumber,
            buyer,
            products: totals.products.map((p) => ({ ...p, inventory_item_id: null })),
            subtotal: totals.subtotal,
            gst_percentage: totals.gst_percentage,
            gst_amount: totals.gst_amount,
            grand_total: totals.grand_total,
            updated_at: new Date(),
          });
          break;
        } catch (err: unknown) {
          const isDupKey =
            (err as { code?: number })?.code === 11000 ||
            /E11000|duplicate key/i.test((err as Error)?.message || '');
          if (isDupKey && attempt < 4) continue;
          if (isDupKey) {
            throw new ValidationError('Could not generate a unique invoice number, please retry.');
          }
          throw err;
        }
      }

      if (!updated) throw new NotFoundError('Bill not found.');
      return this.serializeBill(updated, scope);
    }

    // LEGACY PATH: exact stock reconciliation as today
    if (data.products) {
      const oldDeltas = this.getStockDeltas(bill.products ?? []);
      const newDeltas = this.getStockDeltas(totals.products ?? []);
      const allItemIds = new Set([...oldDeltas.keys(), ...newDeltas.keys()]);
      const positiveNetDeltas = new Map<string, number>();
      const negativeNetDeltas = new Map<string, number>();

      for (const itemId of allItemIds) {
        const net = (newDeltas.get(itemId) ?? 0) - (oldDeltas.get(itemId) ?? 0);
        if (net > 0) positiveNetDeltas.set(itemId, net);
        else if (net < 0) negativeNetDeltas.set(itemId, -net);
      }

      if (positiveNetDeltas.size > 0) {
        await this.validateStockAvailable(scope, positiveNetDeltas);
      }

      for (const [itemId, qtyToRestore] of negativeNetDeltas.entries()) {
        await BillsRepository.adjustInventoryStockById(scope, itemId, qtyToRestore);
      }

      for (const [itemId, needed] of positiveNetDeltas.entries()) {
        const success = await BillsRepository.adjustInventoryStockConditional(scope, itemId, -needed, needed);
        if (!success) {
          throw new ValidationError('Insufficient stock during conversion.');
        }
      }
    }

    const buyer = {
      ...(bill.buyer ?? {}),
      gst_number: gstNumber,
    };

    let updated: BillDoc | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const newInvoiceNumber = await BillsRepository.getNextInvoiceNumber(scope, attempt > 0);
      try {
        updated = await BillsRepository.updateBill(scope, id, {
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
        break;
      } catch (err: unknown) {
        const isDupKey =
          (err as { code?: number })?.code === 11000 ||
          /E11000|duplicate key/i.test((err as Error)?.message || '');
        if (isDupKey && attempt < 4) continue;
        if (isDupKey) {
          throw new ValidationError('Could not generate a unique invoice number, please retry.');
        }
        throw err;
      }
    }

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
    let workerCost = 0;
    let hasOpenAssignments = false;
    const lines = [];

    if (bill.workflow === 'order_first') {
      const linkedAssignments = await BillsRepository.findLinkedAssignments(scope, id);
      const nonCancelled = linkedAssignments.filter((a) => a.status !== 'cancelled');
      hasOpenAssignments = nonCancelled.some(
        (a) => a.status === 'open' || a.status === 'completing' || a.status === 'cancelling'
      );

      for (const a of nonCancelled) {
        const netRaw = Math.max(
          0,
          (Number(a.raw_issued_quantity) || 0) - (Number(a.raw_returned_quantity) || 0)
        );
        const unitCost = Number(a.price_per_unit) || 0;
        const lineCost = roundPy(netRaw * unitCost, 2);
        materialCost += lineCost;
        lines.push({
          inventory_item_id: a.raw_item_id ?? null,
          name: `${a.raw_item_name || 'Raw'} (${a.material_name})`,
          quantity: netRaw,
          unit_cost: unitCost,
          line_cost: lineCost,
          cost_known: unitCost > 0,
        });
      }
      materialCost = roundPy(materialCost, 2);

      const completedAssignments = nonCancelled.filter((a) => a.status === 'completed');
      for (const a of completedAssignments) {
        workerCost += Number(a.wage_amount) || 0;
      }
      workerCost = roundPy(workerCost, 2);
    } else {
      // LEGACY BILL PATH
      for (const p of bill.products ?? []) {
        let unitCost: number | null = null;
        let costKnown = false;
        if (p.inventory_item_id && ObjectId.isValid(p.inventory_item_id)) {
          const item = await BillsRepository.findInventoryItemById(scope, p.inventory_item_id);
          if (item) {
            unitCost = Number(item.cost_price) || 0;
            costKnown = true;
          }
        }
        const lineCost = costKnown ? roundPy((Number(p.quantity) || 0) * (unitCost ?? 0), 2) : 0;
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

      const linkedPayRecords = await BillsRepository.findLinkedPayRecords(
        scope,
        id,
        bill.worker_assignment_ids ?? []
      );

      for (const p of linkedPayRecords) {
        workerCost += (Number(p.units_produced) || 0) * (Number(p.rate_per_unit) || 0);
      }
      workerCost = roundPy(workerCost, 2);
    }

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
      has_open_assignments: hasOpenAssignments,
    };
  }

  static async confirmProfit(scope: TenantScope, id: string, confirmedAmountOverride?: number) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');

    if (bill.workflow === 'order_first') {
      const linkedAssignments = await BillsRepository.findLinkedAssignments(scope, id);
      const serialized = this.serializeBillSync(bill, linkedAssignments);
      const isFullyShipped = serialized.order_status === 'shipped' || serialized.order_status === 'closed';
      if (!isFullyShipped) {
        throw new ValidationError('Cannot confirm profit: order must be fully shipped before confirming profit.');
      }
    }

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

  static async createShipment(scope: TenantScope, id: string, data: ShipmentInput) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');

    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');

    const linkedAssignments = await BillsRepository.findLinkedAssignments(scope, id);
    const nonCancelledAssignments = linkedAssignments.filter(
      (a) => a.status !== 'cancelled'
    );

    const products = bill.products ?? [];
    if (products.length === 0) {
      throw new ValidationError('Bill has no products.');
    }

    const shipments = bill.shipments ?? [];
    const shippedSoFar = new Map<string, number>();
    for (const s of shipments) {
      for (const item of s.items ?? []) {
        const norm = (item.product_name ?? '').trim().toLowerCase();
        shippedSoFar.set(norm, (shippedSoFar.get(norm) ?? 0) + (Number(item.quantity) || 0));
      }
    }

    const producedSoFar = new Map<string, number>();
    for (const a of nonCancelledAssignments) {
      const norm = (a.material_name ?? '').trim().toLowerCase();
      producedSoFar.set(norm, (producedSoFar.get(norm) ?? 0) + (Number(a.produced_quantity) || 0));
    }

    interface ItemToShip {
      product_name: string;
      quantity: number;
      finished_item_id?: string | null;
    }
    const itemsToShip: ItemToShip[] = [];

    if (data.ship_all) {
      for (const p of products) {
        const norm = (p.name ?? '').trim().toLowerCase();
        const produced = producedSoFar.get(norm) ?? 0;
        const shipped = shippedSoFar.get(norm) ?? 0;
        const available = Math.max(0, produced - shipped);
        if (available > 0) {
          const assignmentWithFinished = nonCancelledAssignments.find(
            (a) => (a.material_name ?? '').trim().toLowerCase() === norm && a.finished_item_id
          );
          itemsToShip.push({
            product_name: p.name,
            quantity: available,
            finished_item_id: assignmentWithFinished?.finished_item_id ?? null,
          });
        }
      }
      if (itemsToShip.length === 0) {
        throw new ValidationError('No products are ready to ship.');
      }
    } else {
      if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
        throw new ValidationError('No items specified to ship.');
      }

      for (const reqItem of data.items) {
        const reqName = (reqItem.product_name ?? '').trim();
        const norm = reqName.toLowerCase();
        const matchedProduct = products.find((p) => (p.name ?? '').trim().toLowerCase() === norm);
        if (!matchedProduct) {
          throw new ValidationError(`Product "${reqName}" is not part of this order.`);
        }

        const qty = Number(reqItem.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new ValidationError(`Quantity for "${matchedProduct.name}" must be a positive integer.`);
        }

        const produced = producedSoFar.get(norm) ?? 0;
        const shipped = shippedSoFar.get(norm) ?? 0;
        const available = Math.max(0, produced - shipped);

        if (qty > available) {
          throw new ValidationError(
            `Cannot ship ${qty} of "${matchedProduct.name}": only ${available} ready to ship.`
          );
        }

        producedSoFar.set(norm, produced - qty);

        const assignmentWithFinished = nonCancelledAssignments.find(
          (a) => (a.material_name ?? '').trim().toLowerCase() === norm && a.finished_item_id
        );

        itemsToShip.push({
          product_name: matchedProduct.name,
          quantity: qty,
          finished_item_id: assignmentWithFinished?.finished_item_id ?? null,
        });
      }
    }

    const appliedDeductions: { itemId: string; qty: number; movementId?: ObjectId }[] = [];
    const shipmentDate = data.date ? new Date(data.date).toISOString() : new Date().toISOString();
    const finalShipmentItems: { product_name: string; quantity: number; finished_item_id: string }[] = [];

    try {
      for (const shipItem of itemsToShip) {
        let finishedItem: InventoryItemDoc | null = null;
        if (shipItem.finished_item_id && ObjectId.isValid(shipItem.finished_item_id)) {
          finishedItem = (await BillsRepository.findInventoryItemById(scope, shipItem.finished_item_id)) as InventoryItemDoc | null;
        }
        if (!finishedItem) {
          finishedItem = await InventoryRepository.findItemByNameAndType(scope, shipItem.product_name, 'finished');
        }

        if (!finishedItem) {
          throw new ValidationError(
            `Finished inventory item for "${shipItem.product_name}" not found in stock.`
          );
        }

        const finishedItemId = finishedItem._id.toString();
        const success = await BillsRepository.adjustInventoryStockConditional(
          scope,
          finishedItemId,
          -shipItem.quantity,
          shipItem.quantity
        );

        if (!success) {
          const currentQty = Number(finishedItem.quantity) || 0;
          throw new ValidationError(
            `Insufficient finished stock for "${shipItem.product_name}": requested ${shipItem.quantity}, available ${currentQty}.`
          );
        }

        const movement = await InventoryRepository.insertStockMovement(scope, {
          company_id: scope.companyId,
          date: shipmentDate,
          type: 'shipment_out',
          item_id: finishedItemId,
          item_name: finishedItem.name || shipItem.product_name,
          quantity: shipItem.quantity,
          bill_id: id,
          assignment_id: null,
          worker_id: null,
          notes: data.notes ?? '',
          created_at: new Date(),
        });

        appliedDeductions.push({
          itemId: finishedItemId,
          qty: shipItem.quantity,
          movementId: movement._id,
        });

        finalShipmentItems.push({
          product_name: shipItem.product_name,
          quantity: shipItem.quantity,
          finished_item_id: finishedItemId,
        });
      }

      const shipmentRecord = {
        shipment_id: new ObjectId().toString(),
        date: shipmentDate,
        notes: (data.notes ?? '').trim(),
        items: finalShipmentItems,
      };

      const updated = await BillsRepository.updateBillRaw(scope, id, {
        $push: { shipments: shipmentRecord } as Document,
        $set: { updated_at: new Date() },
      });

      if (!updated) throw new NotFoundError('Bill not found.');
      return await this.serializeBill(updated, scope);
    } catch (err) {
      for (const d of appliedDeductions) {
        await BillsRepository.adjustInventoryStockById(scope, d.itemId, d.qty);
        if (d.movementId) {
          await InventoryRepository.deleteStockMovementById(scope, d.movementId);
        }
      }
      throw err;
    }
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
        assignment_date: formatDjangoIso(item.assignment_date),
        notes: item.notes ?? '',
        batches: (item.batches ?? []).map((b) => ({
          ...b,
          quantity: Number(b.quantity) || 0,
          date: formatDjangoIso(b.date),
        })),
        delivered_quantity: deliveredQty,
        balance_quantity: balanceQty,
        total_value: totalValue,
        status: item.status || 'open',
        completed_at: formatDjangoIso(item.completed_at),
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

  static async getBillPdf(scope: TenantScope, id: string): Promise<{ pdf: Buffer; filename: string }> {
    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');
    const company = await BillsRepository.findCompany(scope);
    const pdf = await BillPdfService.renderBillPdf(bill, company ?? undefined);
    const filename = `${bill.invoice_number || 'invoice'}.pdf`;
    return { pdf, filename };
  }

  static async shareWhatsApp(
    scope: TenantScope,
    id: string,
    phone?: string
  ): Promise<{ detail: string; whatsapp_response: unknown }> {
    const bill = await BillsRepository.findBillById(scope, id);
    if (!bill) throw new NotFoundError('Bill not found.');
    const company = await BillsRepository.findCompany(scope);
    return WhatsAppService.shareBillPdf(bill, company ?? undefined, phone);
  }
}

