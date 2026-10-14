import { ObjectId } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import { BadRequestError, NotFoundError, ValidationError } from '../../utils/errors.js';
import {
  calculateBillDerived,
  calculateBillTotals,
  calculateSuggestedProfit,
  roundPy,
} from '@insightloop/shared';

export class BillsService {
  private static async serializeBill(bill: any, companyId: string) {
    const payRecordsCol = getCollection('pay_records');
    const itemsCol = getCollection('inventory_items');

    const grandTotal = Number(bill.grand_total) || 0;
    const payments = bill.payments || [];
    const profitConfirmed = Boolean(bill.profit_confirmed);

    let readyToDeliverQty = 0;
    if (Array.isArray(bill.ready_to_deliver)) {
      for (const r of bill.ready_to_deliver) {
        readyToDeliverQty += Number(r.quantity) || 0;
      }
    }

    let totalOrderedQty = 0;
    if (Array.isArray(bill.products)) {
      for (const p of bill.products) {
        totalOrderedQty += Number(p.quantity) || 0;
      }
    }

    const shipmentConfirmed = Boolean(bill.shipment_confirmed);
    const billIdStr = bill._id.toString();

    // Query assignments linked to this bill
    const assignmentsCol = getCollection('material_assignments');
    const [linkedPayRecords, linkedAssignments] = await Promise.all([
      payRecordsCol
        .find({
          company_id: companyId,
          $or: [{ bill_id: billIdStr }, { source_assignment_id: { $in: bill.worker_assignment_ids || [] } }],
        })
        .toArray(),
      assignmentsCol
        .find({
          company_id: companyId,
          bill_id: billIdStr,
        })
        .toArray(),
    ]);

    const derived = calculateBillDerived(
      grandTotal,
      payments,
      profitConfirmed,
      bill.bill_type || 'kacha',
      shipmentConfirmed,
      linkedAssignments.map(a => ({ status: String(a.status || '') }))
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

    // Compute worker cost total from pay_records linked to this bill
    let workerCostTotal = 0;
    for (const p of linkedPayRecords) {
      workerCostTotal += (Number(p.units_produced) || 0) * (Number(p.rate_per_unit) || 0);
    }

    const buyerRaw = bill.buyer || {};
    const buyer: Record<string, any> = {};
    if (buyerRaw.name !== undefined) buyer.name = buyerRaw.name;
    if (buyerRaw.address !== undefined) buyer.address = buyerRaw.address;
    if (buyerRaw.gst_number !== undefined) buyer.gst_number = buyerRaw.gst_number;
    if (buyerRaw.phone !== undefined) buyer.phone = buyerRaw.phone;

    return {
      id: billIdStr,
      company_id: bill.company_id,
      bill_type: bill.bill_type,
      buyer,
      products: (bill.products || []).map((p: any) => ({
        name: p.name,
        description: p.description || '',
        quantity: Number(p.quantity) || 0,
        rate: Number(p.rate) || 0,
        unit: p.unit || 'pcs',
        total: Number(p.total) || roundPy((Number(p.quantity) || 0) * (Number(p.rate) || 0), 2),
        inventory_item_id: p.inventory_item_id || null,
      })),
      subtotal: Number(bill.subtotal) || 0,
      gst_percentage: Number(bill.gst_percentage) || 0,
      gst_amount: Number(bill.gst_amount) || 0,
      discount: Number(bill.discount) || 0,
      grand_total: grandTotal,
      invoice_number: bill.invoice_number || '',
      payments: payments.map((p: any) => ({
        amount: Number(p.amount) || 0,
        date: p.date ? new Date(p.date).toISOString() : null,
        notes: p.notes || '',
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
      worker_assignment_ids: bill.worker_assignment_ids || [],
      worker_cost_total: roundPy(workerCostTotal, 2),
      transportation_costs: (bill.transportation_costs || []).map((t: any) => ({
        amount: Number(t.amount) || 0,
        date: t.date ? new Date(t.date).toISOString() : null,
        notes: t.notes || '',
      })),
      transportation_cost_total: roundPy(transportationCostTotal, 2),
      misc_costs: (bill.misc_costs || []).map((m: any) => ({
        amount: Number(m.amount) || 0,
        date: m.date ? new Date(m.date).toISOString() : null,
        notes: m.notes || '',
      })),
      misc_cost_total: roundPy(miscCostTotal, 2),
      ready_to_deliver: (bill.ready_to_deliver || []).map((r: any) => ({
        inventory_item_id: r.inventory_item_id,
        item_name: r.item_name || '',
        quantity: Number(r.quantity) || 0,
        notes: r.notes || '',
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

  static async getNextInvoiceNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const countersCol = getCollection('counters');
    const billsCol = getCollection('bills');

    const counterId = `invoice_${companyId}_${year}`;
    let counter = await countersCol.findOne({ _id: counterId as any });

    if (!counter) {
      // Find highest existing invoice for company and year
      const prefix = `INV-${year}-`;
      const lastBill = await billsCol
        .find({ company_id: companyId, invoice_number: { $regex: new RegExp(`^${prefix}\\d+$`) } })
        .sort({ invoice_number: -1 })
        .limit(1)
        .toArray();

      let startingSeq = 0;
      if (lastBill.length > 0 && lastBill[0].invoice_number) {
        const numPart = lastBill[0].invoice_number.slice(prefix.length);
        startingSeq = parseInt(numPart, 10) || 0;
      }

      await countersCol.updateOne(
        { _id: counterId as any },
        { $setOnInsert: { seq: startingSeq } },
        { upsert: true }
      );
    }

    const updated = await countersCol.findOneAndUpdate(
      { _id: counterId as any },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );

    const seq = updated?.seq || 1;
    return `INV-${year}-${String(seq).padStart(5, '0')}`;
  }

  static async listBills(companyId: string, billType?: string) {
    const billsCol = getCollection('bills');
    const query: Record<string, any> = { company_id: companyId };
    if (billType) {
      query.bill_type = billType;
    }

    const bills = await billsCol.find(query).sort({ created_at: -1 }).toArray();
    const serialized = await Promise.all(bills.map(b => this.serializeBill(b, companyId)));
    return serialized;
  }

  static async getBill(companyId: string, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');

    const bill = await billsCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!bill) throw new NotFoundError('Bill not found.');

    return this.serializeBill(bill, companyId);
  }

  static async createBill(companyId: string, billType: string, data: any) {
    const billsCol = getCollection('bills');
    const itemsCol = getCollection('inventory_items');

    const rawProducts = data.products || [];
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      throw new ValidationError('At least one product is required.');
    }

    const discount = parseFloat(data.discount) || 0;
    const gstPercentage = billType === 'kacha' ? 0 : parseFloat(data.gst_percentage) || 0;

    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);
    const invoiceNumber = await this.getNextInvoiceNumber(companyId);
    const now = new Date();

    // Stock deduction for linked items
    for (const p of totals.products) {
      if (p.inventory_item_id && ObjectId.isValid(p.inventory_item_id)) {
        await itemsCol.updateOne(
          { _id: new ObjectId(p.inventory_item_id), company_id: companyId },
          { $inc: { quantity: -p.quantity } }
        );
      }
    }

    const buyerInput = data.buyer || {};
    const buyer = {
      name: data.buyer_name || buyerInput.name || '',
      address: data.buyer_address || buyerInput.address || '',
      gst_number: data.gst_number || buyerInput.gst_number || null,
      phone: data.buyer_phone || buyerInput.phone || '',
    };

    const doc = {
      company_id: companyId,
      bill_type: billType,
      buyer,
      products: totals.products,
      subtotal: totals.subtotal,
      gst_percentage: totals.gst_percentage,
      gst_amount: totals.gst_amount,
      discount: totals.discount,
      grand_total: totals.grand_total,
      invoice_number: invoiceNumber,
      payments: data.payments || [],
      profit_confirmed: false,
      worker_assignment_ids: [],
      transportation_costs: [],
      misc_costs: [],
      ready_to_deliver: [],
      shipment_confirmed: false,
      created_at: now,
      updated_at: now,
    };

    const result = await billsCol.insertOne(doc as any);
    const created = await billsCol.findOne({ _id: result.insertedId });
    return this.serializeBill(created, companyId);
  }

  static async updateBill(companyId: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');

    const existing = await billsCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!existing) throw new NotFoundError('Bill not found.');

    if (data.bill_type && data.bill_type !== existing.bill_type) {
      throw new ValidationError(
        'Bill type cannot be changed via update. Use the convert endpoint to turn a kacha bill into a pakka bill.'
      );
    }

    const rawProducts = data.products || existing.products || [];
    const discount = data.discount !== undefined ? parseFloat(data.discount) || 0 : existing.discount;
    const gstPercentage =
      existing.bill_type === 'kacha'
        ? 0
        : data.gst_percentage !== undefined
        ? parseFloat(data.gst_percentage) || 0
        : existing.gst_percentage;

    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);

    const updateDoc: Record<string, any> = {
      buyer: data.buyer || existing.buyer,
      products: totals.products,
      subtotal: totals.subtotal,
      gst_percentage: totals.gst_percentage,
      gst_amount: totals.gst_amount,
      discount: totals.discount,
      grand_total: totals.grand_total,
      updated_at: new Date(),
    };

    await billsCol.updateOne({ _id: new ObjectId(id) }, { $set: updateDoc });
    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }

  static async deleteBill(companyId: string, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');
    const itemsCol = getCollection('inventory_items');

    const existing = await billsCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!existing) throw new NotFoundError('Bill not found.');

    // Restore stock for linked products
    if (Array.isArray(existing.products)) {
      for (const p of existing.products) {
        if (p.inventory_item_id && ObjectId.isValid(p.inventory_item_id)) {
          await itemsCol.updateOne(
            { _id: new ObjectId(p.inventory_item_id), company_id: companyId },
            { $inc: { quantity: Number(p.quantity) || 0 } }
          );
        }
      }
    }

    await billsCol.deleteOne({ _id: new ObjectId(id) });
  }

  static async convertToPakka(companyId: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');

    const bill = await billsCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!bill) throw new NotFoundError('Bill not found.');

    if (bill.bill_type === 'pakka') {
      throw new ValidationError('Bill is already a pakka (formal) bill.');
    }

    const gstNumber = (data.gst_number || '').trim();
    if (!gstNumber) throw new ValidationError('GST number is required to convert to pakka.');

    const gstPercentage = parseFloat(data.gst_percentage) || 0;
    const rawProducts = data.products || bill.products || [];
    const discount = bill.discount || 0;

    const totals = calculateBillTotals(rawProducts, discount, gstPercentage);
    const newInvoiceNumber = await this.getNextInvoiceNumber(companyId);

    const buyer = {
      ...(bill.buyer || {}),
      gst_number: gstNumber,
    };

    await billsCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
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
        },
      }
    );

    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }

  static async recordPayment(companyId: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');

    const bill = await billsCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!bill) throw new NotFoundError('Bill not found.');

    const amount = parseFloat(data.amount) || 0;
    if (amount <= 0) throw new ValidationError('Payment amount must be positive.');

    const payment = {
      amount,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: (data.notes || '').trim(),
    };

    await billsCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { payments: payment } as any,
        $set: { updated_at: new Date() },
      }
    );

    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }

  static async getProfitPreview(companyId: string, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');
    const itemsCol = getCollection('inventory_items');
    const payRecordsCol = getCollection('pay_records');

    const bill = await billsCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!bill) throw new NotFoundError('Bill not found.');

    let materialCost = 0;
    const lines = [];

    for (const p of bill.products || []) {
      let unitCost = 0;
      let costKnown = false;
      if (p.inventory_item_id && ObjectId.isValid(p.inventory_item_id)) {
        const item = await itemsCol.findOne({ _id: new ObjectId(p.inventory_item_id) });
        if (item) {
          unitCost = Number(item.cost_price) || 0;
          costKnown = true;
        }
      }
      const lineCost = roundPy((Number(p.quantity) || 0) * unitCost, 2);
      materialCost += lineCost;
      lines.push({
        inventory_item_id: p.inventory_item_id || null,
        name: p.name,
        quantity: Number(p.quantity) || 0,
        unit_cost: unitCost,
        line_cost: lineCost,
        cost_known: costKnown,
      });
    }

    materialCost = roundPy(materialCost, 2);

    let workerCost = 0;
    const linkedPayRecords = await payRecordsCol
      .find({
        company_id: companyId,
        $or: [{ bill_id: id }, { source_assignment_id: { $in: bill.worker_assignment_ids || [] } }],
      })
      .toArray();

    for (const p of linkedPayRecords) {
      workerCost += (Number(p.units_produced) || 0) * (Number(p.rate_per_unit) || 0);
    }
    workerCost = roundPy(workerCost, 2);

    let transportationCost = 0;
    for (const t of bill.transportation_costs || []) {
      transportationCost += Number(t.amount) || 0;
    }
    transportationCost = roundPy(transportationCost, 2);

    let miscCost = 0;
    for (const m of bill.misc_costs || []) {
      miscCost += Number(m.amount) || 0;
    }
    miscCost = roundPy(miscCost, 2);

    const fullCostOfGoods = roundPy(materialCost + workerCost + transportationCost + miscCost, 2);

    let revenueCollected = 0;
    for (const p of bill.payments || []) {
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

  static async confirmProfit(companyId: string, id: string, confirmedAmountOverride?: number) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');

    const preview = await this.getProfitPreview(companyId, id);
    const confirmedAmount =
      confirmedAmountOverride !== undefined && !isNaN(confirmedAmountOverride)
        ? confirmedAmountOverride
        : preview.suggested_profit;

    await billsCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          profit_suggested_amount: preview.suggested_profit,
          profit_confirmed_amount: confirmedAmount,
          profit_confirmed: true,
          profit_confirmed_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }

  static async reopenProfit(companyId: string, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');

    await billsCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          profit_confirmed: false,
          profit_confirmed_amount: null,
          profit_confirmed_at: null,
          updated_at: new Date(),
        },
      }
    );

    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }

  static async addTransportationCost(companyId: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');

    const amount = parseFloat(data.amount) || 0;
    if (amount <= 0) throw new ValidationError('Amount must be positive.');

    const entry = {
      amount,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: (data.notes || '').trim(),
    };

    await billsCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { transportation_costs: entry } as any,
        $set: { updated_at: new Date() },
      }
    );

    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }

  static async addMiscCost(companyId: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');

    const amount = parseFloat(data.amount) || 0;
    if (amount <= 0) throw new ValidationError('Amount must be positive.');

    const entry = {
      amount,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: (data.notes || '').trim(),
    };

    await billsCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { misc_costs: entry } as any,
        $set: { updated_at: new Date() },
      }
    );

    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }

  static async addReadyToDeliver(companyId: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');
    const itemsCol = getCollection('inventory_items');

    const bill = await billsCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!bill) throw new NotFoundError('Bill not found.');
    if (bill.shipment_confirmed) {
      throw new ValidationError('This order has already been marked shipped.');
    }

    const itemId = data.inventory_item_id;
    if (!itemId || !ObjectId.isValid(itemId)) {
      throw new ValidationError('Valid inventory_item_id required.');
    }

    const item = await itemsCol.findOne({ _id: new ObjectId(itemId), company_id: companyId });
    if (!item) {
      throw new NotFoundError('Inventory item not found.');
    }

    const qty = parseFloat(data.quantity) || 0;
    if (qty <= 0) throw new ValidationError('Quantity must be positive.');

    const entry = {
      inventory_item_id: itemId,
      item_name: item.name || '',
      quantity: qty,
      notes: (data.notes || '').trim(),
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    };

    await billsCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { ready_to_deliver: entry } as any,
        $set: { updated_at: new Date() },
      }
    );

    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }

  static async confirmShipment(companyId: string, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid bill id.');
    const billsCol = getCollection('bills');
    const itemsCol = getCollection('inventory_items');

    const bill = await billsCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!bill) throw new NotFoundError('Bill not found.');

    if (Array.isArray(bill.ready_to_deliver)) {
      for (const r of bill.ready_to_deliver) {
        if (r.inventory_item_id && ObjectId.isValid(r.inventory_item_id)) {
          await itemsCol.updateOne(
            { _id: new ObjectId(r.inventory_item_id), company_id: companyId },
            { $inc: { quantity: -Number(r.quantity) } }
          );
        }
      }
    }

    await billsCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          shipment_confirmed: true,
          shipment_confirmed_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    const updated = await billsCol.findOne({ _id: new ObjectId(id) });
    return this.serializeBill(updated, companyId);
  }
}
