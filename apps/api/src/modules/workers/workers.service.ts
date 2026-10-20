import { ObjectId, type Document } from 'mongodb';
import {
  WorkersRepository,
  type MaterialAssignmentDoc,
  type PayRecordDoc,
  type WorkerDoc,
} from './workers.repository.js';
import { InventoryRepository } from '../inventory/inventory.repository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { roundPy } from '@insightloop/shared';
import { formatDjangoIso } from '../../utils/timezone.js';
import type { TenantScope } from '../../types/tenant.js';

export interface WorkerInput {
  name?: string;
  age?: number | string;
  address?: string;
  phone?: string;
  image_url?: string | null;
  joining_date?: string | Date;
  is_active?: boolean;
}

export interface MaterialInput {
  bill_id: string;
  material_name: string;
  quantity: number | string;
  raw_item_id: string;
  raw_per_unit?: number | string;
  issue_quantity?: number | string;
  price_per_unit?: number | string;
  wage_amount?: number | string;
  date?: string | Date;
  notes?: string;
  batches?: { quantity: number; date?: string; notes?: string }[];
}

export interface RawIssueInput {
  quantity: number | string;
  date?: string | Date;
  notes?: string;
}

export interface CompleteAssignmentInput {
  raw_returned_quantity?: number | string;
}

export interface BatchInput {
  quantity?: number | string;
  date?: string;
  notes?: string;
}

export interface PaymentInput {
  product_name?: string;
  units_produced?: number | string;
  rate_per_unit?: number | string;
  amount_paid?: number | string;
  date?: string | Date;
}

export class WorkersService {
  private static serializeWorker(worker: WorkerDoc, assignments: MaterialAssignmentDoc[], payments: PayRecordDoc[]) {
    let pendingAmount = 0;
    for (const p of payments) {
      const units = Number(p.units_produced) || 0;
      const rate = Number(p.rate_per_unit) || 0;
      const totalAmount = units * rate;
      const amountPaid = Number(p.amount_paid) || 0;
      if (!p.paid && amountPaid < totalAmount) {
        pendingAmount += totalAmount - amountPaid;
      }
    }

    const nonCancelled = assignments.filter((a) => a.status !== 'cancelled');
    const completed = nonCancelled.filter((a) => a.status === 'completed');
    let totalAssignedCompleted = 0;
    let totalWasted = 0;
    for (const a of completed) {
      totalAssignedCompleted += Number(a.quantity) || 0;
      totalWasted += Number(a.wastage_quantity) || 0;
    }

    const wastageRate =
      totalAssignedCompleted > 0
        ? roundPy((totalWasted / totalAssignedCompleted) * 100, 1)
        : 0.0;

    let totalTargeted = 0;
    let totalProduced = 0;
    let totalRawIssued = 0;
    let totalRawReturned = 0;
    let openCount = 0;

    for (const a of nonCancelled) {
      totalTargeted += Number(a.quantity) || 0;
      const prod =
        Number(a.produced_quantity) ||
        (Array.isArray(a.batches) ? a.batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0) : 0);
      totalProduced += prod;
      totalRawIssued += Number(a.raw_issued_quantity) || 0;
      totalRawReturned += Number(a.raw_returned_quantity) || 0;
      if (a.status === 'open') openCount += 1;
    }

    return {
      id: worker._id.toString(),
      name: worker.name,
      age: worker.age !== undefined && worker.age !== null ? Number(worker.age) : null,
      address: worker.address ?? null,
      phone: worker.phone ?? null,
      image_url: worker.image_url ?? null,
      joining_date: formatDjangoIso(worker.joining_date),
      is_active: worker.is_active !== false,
      material_assigned: totalTargeted,
      material_delivered: totalProduced,
      raw_issued: totalRawIssued,
      raw_returned: totalRawReturned,
      pending_amount: roundPy(pendingAmount, 2),
      open_assignments: openCount,
      total_wasted: totalWasted,
      wastage_rate: wastageRate,
      created_at: formatDjangoIso(worker.created_at),
      updated_at: formatDjangoIso(worker.updated_at),
    };
  }

  private static serializeAssignment(item: MaterialAssignmentDoc, _worker: WorkerDoc | null = null) {
    let deliveredQty = 0;
    if (Array.isArray(item.batches)) {
      for (const b of item.batches) deliveredQty += Number(b.quantity) || 0;
    }
    const producedQty = Number(item.produced_quantity) || deliveredQty;
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price_per_unit) || 0;
    const balanceQty = Math.max(0, qty - producedQty);
    const totalValue = roundPy(qty * price, 2);

    const rawIssued = Number(item.raw_issued_quantity) || 0;
    const rawReturned = Number(item.raw_returned_quantity) || 0;
    const rawNet = Math.max(0, rawIssued - rawReturned);
    const rawPerUnit = Number(item.raw_per_unit) || 1;
    const plannedRaw = roundPy(qty * rawPerUnit, 4);

    const workerId = (item.worker_id ?? (item.worker as { _id?: unknown })?._id ?? item.worker)?.toString();

    return {
      id: item._id.toString(),
      worker_id: workerId ?? null,
      worker_name: (item.worker as { name?: string })?.name || _worker?.name || undefined,
      bill_id: item.bill_id ?? null,
      material_name: item.material_name,
      quantity: qty,
      price_per_unit: price,
      unit: item.unit ?? 'pcs',
      raw_item_id: item.raw_item_id ?? null,
      raw_item_name: item.raw_item_name ?? null,
      raw_unit: item.raw_unit ?? 'pcs',
      raw_per_unit: rawPerUnit,
      raw_issues: (item.raw_issues ?? []).map((ri) => ({
        issue_id: ri.issue_id,
        quantity: Number(ri.quantity) || 0,
        date: formatDjangoIso(ri.date),
        notes: ri.notes ?? '',
      })),
      raw_issued_quantity: rawIssued,
      raw_returned_quantity: rawReturned,
      raw_net_used: rawNet,
      planned_raw: plannedRaw,
      produced_quantity: producedQty,
      finished_item_id: item.finished_item_id ?? null,
      assignment_date: formatDjangoIso(item.assignment_date),
      notes: item.notes ?? '',
      batches: (item.batches ?? []).map((b) => ({
        batch_id: b.batch_id,
        batch_number: b.batch_number,
        quantity: Number(b.quantity) || 0,
        date: formatDjangoIso(b.date),
        notes: b.notes ?? '',
        synced_to_inventory: Boolean(b.synced_to_inventory),
      })),
      delivered_quantity: producedQty,
      balance_quantity: balanceQty,
      total_value: totalValue,
      status: (item.status === 'completing' || item.status === 'cancelling') ? 'open' : (item.status || 'open'),
      completed_at: formatDjangoIso(item.completed_at),
      wastage_quantity:
        item.wastage_quantity !== undefined && item.wastage_quantity !== null
          ? Number(item.wastage_quantity)
          : null,
      over_returned: producedQty > qty,
      wage_amount: Number(item.wage_amount) || 0,
      pay_record_id: item.pay_record_id ?? null,
    };
  }

  private static serializePayment(item: PayRecordDoc, worker: WorkerDoc | { name?: string } | null = null) {
    const units = Number(item.units_produced) || 0;
    const rate = Number(item.rate_per_unit) || 0;
    const totalAmount = roundPy(units * rate, 2);
    const amountPaid = Number(item.amount_paid) || 0;
    const workerId = (item.worker_id ?? (item.worker as { _id?: unknown })?._id ?? item.worker)?.toString();

    return {
      id: item._id.toString(),
      worker_id: workerId ?? null,
      worker_name: worker?.name ?? (item.worker as { name?: string } | undefined)?.name ?? 'Unknown',
      product_name: item.product_name,
      units_produced: units,
      rate_per_unit: rate,
      amount_paid: amountPaid,
      total_amount: totalAmount,
      date: formatDjangoIso(item.date),
      paid: item.paid || amountPaid >= totalAmount,
      bill_id: item.bill_id ?? null,
      source_assignment_id: item.source_assignment_id ?? null,
    };
  }

  static async listWorkers(scope: TenantScope) {
    const workers = await WorkersRepository.findWorkers(scope);
    if (workers.length === 0) return [];

    const workerIds = workers.map((w) => w._id);
    const [assignmentSummaries, paymentSummaries] = await Promise.all([
      WorkersRepository.aggregateWorkerAssignmentSummaries(scope, workerIds),
      WorkersRepository.aggregateWorkerPaymentSummaries(scope, workerIds),
    ]);

    const aMap = new Map<string, Document>();
    for (const a of assignmentSummaries) {
      if (a._id) aMap.set(String(a._id), a);
    }

    const pMap = new Map<string, Document>();
    for (const p of paymentSummaries) {
      if (p._id) pMap.set(String(p._id), p);
    }

    return workers.map((w) => {
      const wid = w._id.toString();
      const a = aMap.get(wid);
      const p = pMap.get(wid);

      const totalCompleted = Number(a?.total_assigned_completed) || 0;
      const totalWasted = Number(a?.total_wasted) || 0;
      const wastageRate = totalCompleted > 0 ? roundPy((totalWasted / totalCompleted) * 100, 1) : 0.0;

      return {
        id: wid,
        name: w.name,
        age: w.age ?? null,
        address: w.address ?? null,
        phone: w.phone ?? null,
        image_url: w.image_url ?? null,
        joining_date: formatDjangoIso(w.joining_date),
        is_active: w.is_active !== false,
        material_assigned: Number(a?.material_assigned) || 0,
        material_delivered: Number(a?.material_delivered) || 0,
        raw_issued: Number(a?.raw_issued) || 0,
        raw_returned: Number(a?.raw_returned) || 0,
        pending_amount: roundPy(Number(p?.pending_amount) || 0, 2),
        open_assignments: Number(a?.open_assignments) || 0,
        total_wasted: totalWasted,
        wastage_rate: wastageRate,
        created_at: formatDjangoIso(w.created_at),
        updated_at: formatDjangoIso(w.updated_at),
      };
    });
  }

  static async getWorker(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid worker id.');

    const worker = await WorkersRepository.findWorkerById(scope, id);
    if (!worker) throw new NotFoundError('Worker not found.');

    const assignments = await WorkersRepository.findAssignmentsByWorker(scope, id);
    const payments = await WorkersRepository.findPaymentsByWorker(scope, id);

    return this.serializeWorker(worker, assignments, payments);
  }

  static async createWorker(scope: TenantScope, data: WorkerInput) {
    const name = (data.name ?? '').trim();
    if (!name) throw new ValidationError('Worker name is required.');

    const now = new Date();
    const ageVal =
      data.age !== undefined && data.age !== null && String(data.age).trim() !== ''
        ? parseInt(String(data.age), 10)
        : null;

    const created = await WorkersRepository.insertWorker(scope, {
      name,
      age: Number.isNaN(ageVal) ? null : ageVal,
      address: data.address?.trim() ? data.address.trim() : null,
      phone: data.phone?.trim() ? data.phone.trim() : null,
      image_url: data.image_url ?? null,
      joining_date: data.joining_date ? new Date(data.joining_date) : now,
      is_active: data.is_active !== false,
      created_at: now,
      updated_at: now,
    });

    return this.serializeWorker(created, [], []);
  }

  static async updateWorker(scope: TenantScope, id: string, data: WorkerInput) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid worker id.');

    const existing = await WorkersRepository.findWorkerById(scope, id);
    if (!existing) throw new NotFoundError('Worker not found.');

    const updateFields: Partial<WorkerDoc> = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) updateFields.name = (data.name ?? '').trim();
    if (data.age !== undefined) {
      const parsed =
        data.age !== null && String(data.age).trim() !== '' ? parseInt(String(data.age), 10) : null;
      updateFields.age = Number.isNaN(parsed) ? null : parsed;
    }
    if (data.address !== undefined) updateFields.address = (data.address ?? '').trim();
    if (data.phone !== undefined) updateFields.phone = (data.phone ?? '').trim();
    if (data.image_url !== undefined) updateFields.image_url = data.image_url;
    if (data.is_active !== undefined) updateFields.is_active = Boolean(data.is_active);
    if (data.joining_date !== undefined) updateFields.joining_date = new Date(data.joining_date);

    await WorkersRepository.updateWorker(scope, id, updateFields);
    return this.getWorker(scope, id);
  }

  static async deleteWorker(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid worker id.');

    const existing = await WorkersRepository.findWorkerById(scope, id);
    if (!existing) throw new NotFoundError('Worker not found.');

    // R11 Guard: Delete worker blocked (400) if the worker has any open assignment
    const openAssignments = await WorkersRepository.findOpenAssignmentsByWorker(scope, id);
    if (openAssignments.length > 0) {
      throw new ValidationError('Cannot delete worker: worker has open material assignments.');
    }

    await WorkersRepository.deleteAssignmentsByWorker(scope, id);
    await WorkersRepository.deletePaymentsByWorker(scope, id);
    await WorkersRepository.deleteWorker(scope, id);
  }

  static async listMaterials(scope: TenantScope, workerId: string) {
    if (!ObjectId.isValid(workerId)) throw new ValidationError('Invalid worker id.');
    const worker = await WorkersRepository.findWorkerById(scope, workerId);
    if (!worker) throw new NotFoundError('Worker not found.');

    const assignments = await WorkersRepository.findAssignmentsByWorker(scope, workerId);
    return assignments.map((a) => this.serializeAssignment(a, worker));
  }

  static async createMaterial(scope: TenantScope, workerId: string, data: MaterialInput) {
    if (!ObjectId.isValid(workerId)) throw new ValidationError('Invalid worker id.');

    const worker = await WorkersRepository.findWorkerById(scope, workerId);
    if (!worker) throw new NotFoundError('Worker not found.');
    if (worker.is_active === false) {
      throw new ValidationError('Worker is inactive.');
    }

    // R3: material_name required
    const materialName = (data.material_name ?? '').trim();
    if (!materialName) throw new ValidationError('Material name is required.');

    // R3: quantity = target output, positive integer
    const qty = Number(data.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new ValidationError('Quantity must be a positive number.');
    }
    if (!Number.isInteger(qty)) {
      throw new ValidationError('Target quantity must be a positive integer.');
    }

    if (data.price_per_unit !== undefined && data.price_per_unit !== null) {
      const price = Number(data.price_per_unit);
      if (isNaN(price) || price <= 0) {
        throw new ValidationError('Price per unit must be a positive number.');
      }
    }

    // R3: bill_id required
    if (!data.bill_id) {
      throw new ValidationError('Valid bill_id is required.');
    }
    if (!ObjectId.isValid(data.bill_id)) {
      throw new ValidationError('Invalid bill id.');
    }
    const bill = await WorkersRepository.findBillById(scope, data.bill_id);
    if (!bill) {
      throw new ValidationError('That bill was not found for this company.');
    }

    // R3: material_name matches a bill line (case-insensitive)
    const billProducts = (bill.products as { name: string; quantity: number; rate: number; unit?: string }[]) ?? [];
    const matchedLine = billProducts.find((p) => (p.name || '').trim().toLowerCase() === materialName.toLowerCase());
    if (!matchedLine) {
      throw new ValidationError(`Product "${materialName}" does not match any line in the specified bill.`);
    }


    const activeAssignments = await WorkersRepository.findActiveAssignmentsForBill(scope, data.bill_id);
    const normLine = materialName.toLowerCase();
    let alreadyTargeted = 0;
    for (const a of activeAssignments) {
      if ((a.material_name || '').trim().toLowerCase() === normLine) {
        alreadyTargeted += Number(a.quantity) || 0;
      }
    }
    const orderedQty = Number(matchedLine.quantity) || 0;
    const remainingToAssign = Math.max(0, orderedQty - alreadyTargeted);
    if (qty > remainingToAssign) {
      throw new ValidationError(
        `Quantity (${qty}) exceeds remaining unassigned quantity (${remainingToAssign}) for product "${matchedLine.name}".`
      );
    }

    // R3: raw_item_id required, inventory item of type raw
    if (!data.raw_item_id || !ObjectId.isValid(data.raw_item_id)) {
      throw new ValidationError('Valid raw_item_id is required.');
    }
    const rawItem = await InventoryRepository.findItemById(scope, data.raw_item_id);
    if (rawItem?.type !== 'raw') {
      throw new ValidationError('Raw inventory item not found or is not of type raw.');
    }

    const rawPerUnit = data.raw_per_unit !== undefined ? Number(data.raw_per_unit) : 1;
    if (isNaN(rawPerUnit) || rawPerUnit <= 0) {
      throw new ValidationError('raw_per_unit must be greater than 0.');
    }

    const plannedRaw = roundPy(qty * rawPerUnit, 4);
    const issueQty = data.issue_quantity !== undefined ? Number(data.issue_quantity) : plannedRaw;
    if (isNaN(issueQty) || issueQty < 0) {
      throw new ValidationError('Issue quantity cannot be negative.');
    }

    const pricePerUnit =
      data.price_per_unit !== undefined ? Number(data.price_per_unit) : (Number(rawItem.cost_price) || 0);
    const wageAmount = Number(data.wage_amount ?? 0);
    if (isNaN(wageAmount) || wageAmount < 0) {
      throw new ValidationError('Wage amount cannot be negative.');
    }

    const assignmentDate = data.date ? new Date(data.date) : new Date();
    const notes = (data.notes ?? '').trim();
    const assignmentId = new ObjectId();
    const issueDateStr = assignmentDate.toISOString();
    const issueId = new ObjectId().toString();

    let movementId: ObjectId | null = null;
    if (issueQty > 0) {
      const success = await InventoryRepository.adjustStockConditional(scope, data.raw_item_id, -issueQty, issueQty);
      if (!success) {
        const available = Number(rawItem.quantity) || 0;
        const reqStr = Number.isInteger(issueQty) ? `${issueQty}.0` : String(issueQty);
        const availStr = Number.isInteger(available) ? `${available}.0` : String(available);
        throw new ValidationError(
          `Insufficient raw stock: ${rawItem.name}: requested ${reqStr} ${rawItem.unit || 'pcs'}, only ${availStr} ${rawItem.unit || 'pcs'} in stock`
        );
      }

      const movement = await InventoryRepository.insertStockMovement(scope, {
        company_id: scope.companyId,
        date: issueDateStr,
        type: 'raw_issue',
        item_id: data.raw_item_id,
        item_name: rawItem.name,
        quantity: issueQty,
        bill_id: data.bill_id,
        assignment_id: assignmentId.toString(),
        worker_id: worker._id.toString(),
        notes,
        created_at: new Date(),
      });
      movementId = movement._id;
    }

    try {
      const created = await WorkersRepository.insertAssignment(scope, {
        _id: assignmentId,
        worker: worker._id,
        bill_id: data.bill_id,
        material_name: matchedLine.name,
        quantity: qty,
        price_per_unit: pricePerUnit,
        unit: matchedLine.unit || 'pcs',
        raw_item_id: data.raw_item_id,
        raw_item_name: rawItem.name,
        raw_unit: rawItem.unit || 'pcs',
        raw_per_unit: rawPerUnit,
        raw_issues: issueQty > 0 ? [{ issue_id: issueId, quantity: issueQty, date: issueDateStr, notes }] : [],
        raw_issued_quantity: issueQty,
        raw_returned_quantity: 0,
        produced_quantity: 0,
        finished_item_id: null,
        batches: [],
        status: 'open',
        wage_amount: wageAmount,
        assignment_date: assignmentDate,
        notes,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Fix 8: Concurrency on order cap: sum of targets must not exceed ordered quantity
      const activeForLine = await WorkersRepository.findActiveAssignmentsForBill(scope, data.bill_id);
      const matching = activeForLine.filter(
        (a) => (a.material_name || '').trim().toLowerCase() === normLine
      );
      const sumTargets = matching.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
      if (sumTargets > orderedQty) {
        await WorkersRepository.deleteAssignmentById(scope, created._id);
        throw new ValidationError(
          `Concurrent assignment creation exceeded ordered quantity for product "${matchedLine.name}". Ordered: ${orderedQty}, attempted total: ${sumTargets}.`
        );
      }

      await WorkersRepository.linkBillWorkerAssignment(scope, data.bill_id, created._id.toString());
      return this.serializeAssignment(created, worker);
    } catch (err) {
      if (issueQty > 0) {
        await InventoryRepository.adjustStockById(scope, data.raw_item_id, issueQty);
        if (movementId) {
          await InventoryRepository.deleteStockMovementById(scope, movementId);
        }
      }
      throw err;
    }
  }

  static async issueRawMaterial(scope: TenantScope, assignmentId: string, data: RawIssueInput) {
    if (!ObjectId.isValid(assignmentId)) throw new ValidationError('Invalid material assignment id.');

    const assignment = await WorkersRepository.findAssignmentById(scope, assignmentId);
    if (!assignment) throw new NotFoundError('Material assignment not found.');

    if (assignment.status !== 'open') {
      throw new ValidationError('Cannot issue raw material to a non-open assignment.');
    }

    if (!assignment.raw_item_id) {
      throw new ValidationError('Assignment has no linked raw material item.');
    }

    const rawItem = await InventoryRepository.findItemById(scope, assignment.raw_item_id);
    if (!rawItem) {
      throw new NotFoundError('Linked raw inventory item not found.');
    }

    const qty = Number(data.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new ValidationError('Issue quantity must be a positive number.');
    }

    const success = await InventoryRepository.adjustStockConditional(scope, assignment.raw_item_id, -qty, qty);
    if (!success) {
      const available = Number(rawItem.quantity) || 0;
      const reqStr = Number.isInteger(qty) ? `${qty}.0` : String(qty);
      const availStr = Number.isInteger(available) ? `${available}.0` : String(available);
      throw new ValidationError(
        `Insufficient raw stock: ${rawItem.name}: requested ${reqStr} ${rawItem.unit || 'pcs'}, only ${availStr} ${rawItem.unit || 'pcs'} in stock`
      );
    }

    const issueId = new ObjectId().toString();
    const issueDateStr = data.date ? new Date(data.date).toISOString() : new Date().toISOString();
    const notes = (data.notes ?? '').trim();

    let movement;
    try {
      movement = await InventoryRepository.insertStockMovement(scope, {
        company_id: scope.companyId,
        date: issueDateStr,
        type: 'raw_issue',
        item_id: assignment.raw_item_id,
        item_name: assignment.raw_item_name || rawItem.name,
        quantity: qty,
        bill_id: assignment.bill_id ?? null,
        assignment_id: assignmentId,
        worker_id: assignment.worker_id ?? assignment.worker?.toString() ?? null,
        notes,
        created_at: new Date(),
      });

      const updated = await WorkersRepository.addRawIssue(
        scope,
        assignmentId,
        {
          issue_id: issueId,
          quantity: qty,
          date: issueDateStr,
          notes,
        },
        qty
      );

      if (!updated) throw new NotFoundError('Material assignment not found.');
      return this.serializeAssignment(updated);
    } catch (err) {
      await InventoryRepository.adjustStockById(scope, assignment.raw_item_id, qty);
      if (movement) {
        await InventoryRepository.deleteStockMovementById(scope, movement._id);
      }
      throw err;
    }
  }

  static async addBatch(scope: TenantScope, assignmentId: string, data: BatchInput) {
    if (!ObjectId.isValid(assignmentId)) throw new ValidationError('Invalid material assignment id.');

    const assignment = await WorkersRepository.findAssignmentById(scope, assignmentId);
    if (!assignment) throw new NotFoundError('Material assignment not found.');

    if (assignment.status !== 'open') {
      throw new ValidationError('Cannot add batch: assignment is not open.');
    }

    const rawQty = data.quantity;
    let qty: number;
    if (typeof rawQty === 'string') {
      if (rawQty.includes('.')) {
        throw new ValidationError('Batch quantity must be an integer.');
      }
      qty = parseInt(rawQty, 10);
    } else if (typeof rawQty === 'number') {
      qty = Math.trunc(rawQty);
    } else {
      qty = 0;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      throw new ValidationError('Batch quantity must be a positive number.');
    }

    const targetQty = Number(assignment.quantity) || 0;
    const currentProduced =
      Number(assignment.produced_quantity) ||
      (Array.isArray(assignment.batches) ? assignment.batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0) : 0);
    const remaining = Math.max(0, targetQty - currentProduced);
    if (qty > remaining) {
      throw new ValidationError(
        `Output can never exceed the order, that would create stock without an order. Remaining target: ${remaining}, requested: ${qty}.`
      );
    }

    const batchId = new ObjectId().toString();
    let batchDate = new Date();
    if (data.date && typeof data.date === 'string' && data.date.trim()) {
      try {
        const [y, m, d] = data.date.slice(0, 10).split('-').map(Number);
        if (y && m && d) {
          batchDate = new Date(Date.UTC(y, m - 1, d));
        }
      } catch {
        // SILENT-FALLBACK-REASON: Fallback to datetime.now() on invalid batch date format
        batchDate = new Date();
      }
    }
    const batchDateStr = formatDjangoIso(batchDate) ?? batchDate.toISOString();
    const batchRecord = {
      batch_id: batchId,
      batch_number: `B-${(assignment.batches?.length ?? 0) + 1}`,
      quantity: qty,
      date: batchDateStr,
      notes: (data.notes ?? '').trim(),
      synced_to_inventory: false,
    };

    const updatedAssignment = await WorkersRepository.addBatchWithRaceCheck(
      scope,
      assignmentId,
      batchRecord,
      targetQty,
      qty
    );
    if (!updatedAssignment) {
      throw new ValidationError('Output can never exceed the order, that would create stock without an order.');
    }

    // R5: Increase Finished stock immediately (find-or-create)
    let syncError: unknown = null;
    let finishedItemId: string | null = null;
    try {
      let finishedItem = null;
      if (updatedAssignment.finished_item_id && ObjectId.isValid(updatedAssignment.finished_item_id)) {
        finishedItem = await InventoryRepository.findItemById(scope, updatedAssignment.finished_item_id);
      }
      if (!finishedItem) {
        finishedItem = await InventoryRepository.findItemByNameAndType(scope, updatedAssignment.material_name, 'finished');
      }
      if (!finishedItem) {
        const bill = updatedAssignment.bill_id ? await WorkersRepository.findBillById(scope, updatedAssignment.bill_id) : null;
        const line = (bill?.products as { name: string; unit?: string; rate?: number }[] | undefined)?.find(
          (p) => (p.name || '').trim().toLowerCase() === updatedAssignment.material_name.trim().toLowerCase()
        );
        const sku = await InventoryRepository.getNextSku(scope);
        finishedItem = await InventoryRepository.insertItem(scope, {
          company_id: scope.companyId,
          name: updatedAssignment.material_name,
          type: 'finished',
          unit: line?.unit || updatedAssignment.unit || 'pcs',
          quantity: 0,
          cost_price: 0,
          selling_price: Number(line?.rate) || 0,
          sku,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      finishedItemId = finishedItem._id.toString();
      await InventoryRepository.adjustStockById(scope, finishedItemId, qty);

      await InventoryRepository.insertStockMovement(scope, {
        company_id: scope.companyId,
        date: batchDateStr,
        type: 'production_in',
        item_id: finishedItemId,
        item_name: finishedItem.name,
        quantity: qty,
        bill_id: updatedAssignment.bill_id ?? null,
        assignment_id: assignmentId,
        worker_id: updatedAssignment.worker_id ?? updatedAssignment.worker?.toString() ?? null,
        notes: (data.notes ?? '').trim(),
        created_at: new Date(),
      });
    } catch (err) {
      syncError = err;
      logger.warn(
        { err, assignmentId, batchId },
        'Failed to increment finished inventory for batch; left synced_to_inventory:false for completeAssignment catch-up'
      );
    }

    if (!syncError && finishedItemId) {
      try {
        await WorkersRepository.markBatchSynced(scope, assignmentId, batchId, finishedItemId);
      } catch {
        // Retry once
        try {
          await WorkersRepository.markBatchSynced(scope, assignmentId, batchId, finishedItemId);
        } catch (retryErr) {
          logger.error(
            { err: retryErr, assignmentId, batchId },
            'CRITICAL: markBatchSynced failed after finished stock was incremented'
          );
        }
      }
    }

    const finalAssignment = await WorkersRepository.findAssignmentById(scope, assignmentId);
    return this.serializeAssignment(finalAssignment ?? updatedAssignment);
  }

  static async completeAssignment(scope: TenantScope, assignmentId: string, data?: CompleteAssignmentInput) {
    if (!ObjectId.isValid(assignmentId)) throw new ValidationError('Invalid material assignment id.');

    const assignment = await WorkersRepository.findAssignmentById(scope, assignmentId);
    if (!assignment) throw new NotFoundError('Material assignment not found.');

    // Fix 1: reject anything that is not open
    if (assignment.status !== 'open') {
      if (assignment.status === 'completed') {
        throw new ValidationError('This assignment is already marked complete.');
      }
      if (assignment.status === 'cancelled') {
        throw new ValidationError('Cannot complete assignment with status "cancelled". Only open assignments can be completed.');
      }
      throw new ValidationError(`Cannot complete assignment with status "${assignment.status}". Only open assignments can be completed.`);
    }

    const rawReturnedReq = data?.raw_returned_quantity !== undefined ? Number(data.raw_returned_quantity) : 0;
    const issuedQty = Number(assignment.raw_issued_quantity) || 0;
    const alreadyReturned = Number(assignment.raw_returned_quantity) || 0;
    const maxReturnable = Math.max(0, issuedQty - alreadyReturned);

    if (rawReturnedReq < 0 || rawReturnedReq > maxReturnable) {
      throw new ValidationError(`Raw returned quantity must be between 0 and ${maxReturnable}.`);
    }

    const totalReturned = alreadyReturned + rawReturnedReq;

    // Fix 2: Step 1 - Atomically claim the return on the assignment
    const claimed = await WorkersRepository.claimCompletingAssignment(
      scope,
      assignmentId,
      totalReturned
    );
    if (!claimed) {
      throw new ValidationError('Cannot complete assignment: assignment is not open or is currently being completed.');
    }

    let rawMovementId: ObjectId | null = null;
    let rawAdjusted = false;

    try {
      // Fix 3: Step 2 - Sync any unsynced batches (atomic claim per batch false->true)
      const batches = claimed.batches ?? [];
      for (const b of batches) {
        if (!b.synced_to_inventory && Number(b.quantity) > 0 && b.batch_id) {
          const claimedBatch = await WorkersRepository.claimBatchSync(scope, assignmentId, b.batch_id, claimed.finished_item_id);
          if (!claimedBatch) continue;

          try {
            const bQty = Number(b.quantity);
            let finishedItem = null;
            if (claimed.finished_item_id && ObjectId.isValid(claimed.finished_item_id)) {
              finishedItem = await InventoryRepository.findItemById(scope, claimed.finished_item_id);
            }
            if (!finishedItem) {
              finishedItem = await InventoryRepository.findItemByNameAndType(scope, claimed.material_name, 'finished');
            }
            if (!finishedItem) {
              const bill = claimed.bill_id ? await WorkersRepository.findBillById(scope, claimed.bill_id) : null;
              const line = (bill?.products as { name: string; unit?: string; rate?: number }[] | undefined)?.find(
                (p) => (p.name || '').trim().toLowerCase() === claimed.material_name.trim().toLowerCase()
              );
              const sku = await InventoryRepository.getNextSku(scope);
              finishedItem = await InventoryRepository.insertItem(scope, {
                company_id: scope.companyId,
                name: claimed.material_name,
                type: 'finished',
                unit: line?.unit || claimed.unit || 'pcs',
                quantity: 0,
                cost_price: 0,
                selling_price: Number(line?.rate) || 0,
                sku,
                created_at: new Date(),
                updated_at: new Date(),
              });
            }

            const finishedItemId = finishedItem._id.toString();
            await InventoryRepository.adjustStockById(scope, finishedItemId, bQty);

            const batchDateStr = b.date ? formatDjangoIso(b.date) : new Date().toISOString();
            await InventoryRepository.insertStockMovement(scope, {
              company_id: scope.companyId,
              date: batchDateStr,
              type: 'production_in',
              item_id: finishedItemId,
              item_name: finishedItem.name,
              quantity: bQty,
              bill_id: claimed.bill_id ?? null,
              assignment_id: assignmentId,
              worker_id: claimed.worker_id ?? claimed.worker?.toString() ?? null,
              notes: b.notes ?? '',
              created_at: new Date(),
            });
          } catch (batchSyncErr) {
            await WorkersRepository.unclaimBatchSync(scope, assignmentId, b.batch_id);
            throw batchSyncErr;
          }
        }
      }

      // Step 3: Handle raw return (R6)
      if (rawReturnedReq > 0 && claimed.raw_item_id) {
        await InventoryRepository.adjustStockById(scope, claimed.raw_item_id, rawReturnedReq);
        rawAdjusted = true;
        const movement = await InventoryRepository.insertStockMovement(scope, {
          company_id: scope.companyId,
          date: new Date().toISOString(),
          type: 'raw_return',
          item_id: claimed.raw_item_id,
          item_name: claimed.raw_item_name || 'Raw material',
          quantity: rawReturnedReq,
          bill_id: claimed.bill_id ?? null,
          assignment_id: assignmentId,
          worker_id: claimed.worker_id ?? claimed.worker?.toString() ?? null,
          notes: 'Returned upon assignment completion',
          created_at: new Date(),
        });
        rawMovementId = movement._id;
      }

      // Step 4: Auto pay record (resumable)
      let payRecordId = claimed.pay_record_id;
      if (!payRecordId && Number(claimed.wage_amount) > 0) {
        const rawWorkerId = (claimed.worker_id ?? (claimed.worker as { _id?: unknown })?._id ?? claimed.worker)?.toString();
        const workerRef = rawWorkerId && ObjectId.isValid(rawWorkerId) ? new ObjectId(rawWorkerId) : (claimed.worker as ObjectId);

        const createdPayRecord = await WorkersRepository.insertPayment(scope, {
          worker: workerRef,
          product_name: claimed.material_name,
          units_produced: 1,
          rate_per_unit: Number(claimed.wage_amount),
          amount_paid: 0,
          paid: false,
          date: new Date(),
          bill_id: claimed.bill_id ?? null,
          source_assignment_id: assignmentId,
          created_at: new Date(),
        });
        payRecordId = createdPayRecord._id.toString();
        await WorkersRepository.updateAssignment(scope, assignmentId, { pay_record_id: payRecordId });
      }

      // Step 5: Wastage and completion status
      const producedQty =
        Number(claimed.produced_quantity) ||
        batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
      const rawPerUnit = Number(claimed.raw_per_unit) || 1;
      const wastageQty = Math.max(0, issuedQty - totalReturned - producedQty * rawPerUnit);

      const completedAt = new Date();
      await WorkersRepository.updateAssignment(scope, assignmentId, {
        status: 'completed',
        completed_at: completedAt,
        wastage_quantity: wastageQty,
        raw_returned_quantity: totalReturned,
        synced_to_inventory: true,
        updated_at: completedAt,
      });

      // Step 6: Link to bill if linked
      if (claimed.bill_id && ObjectId.isValid(claimed.bill_id)) {
        await WorkersRepository.linkBillWorkerAssignment(scope, claimed.bill_id, assignmentId);
      }

      const updated = await WorkersRepository.findAssignmentById(scope, assignmentId);
      if (!updated) throw new NotFoundError('Material assignment not found.');
      return this.serializeAssignment(updated);
    } catch (err) {
      logger.error({ err, assignmentId }, 'Failed to complete assignment, restoring status to open');
      if (rawAdjusted && claimed.raw_item_id && rawReturnedReq > 0) {
        await InventoryRepository.adjustStockById(scope, claimed.raw_item_id, -rawReturnedReq);
        if (rawMovementId) {
          await InventoryRepository.deleteStockMovementById(scope, rawMovementId);
        }
      }
      await WorkersRepository.updateAssignment(scope, assignmentId, {
        status: 'open',
        raw_returned_quantity: alreadyReturned,
        updated_at: new Date(),
      });
      throw err;
    }
  }

  static async cancelAssignment(scope: TenantScope, assignmentId: string) {
    if (!ObjectId.isValid(assignmentId)) throw new ValidationError('Invalid material assignment id.');

    const assignment = await WorkersRepository.findAssignmentById(scope, assignmentId);
    if (!assignment) throw new NotFoundError('Material assignment not found.');

    if (assignment.status !== 'open') {
      throw new ValidationError('Only open assignments can be cancelled.');
    }

    const produced = Number(assignment.produced_quantity) || 0;
    const batches = assignment.batches ?? [];
    if (produced > 0 || batches.length > 0) {
      throw new ValidationError('Cannot cancel assignment: production has already been recorded.');
    }

    const issued = Number(assignment.raw_issued_quantity) || 0;
    const returned = Number(assignment.raw_returned_quantity) || 0;
    const rawToReturn = Math.max(0, issued - returned);

    // Fix 2: Atomically claim cancellation on the assignment
    const claimed = await WorkersRepository.claimCancellingAssignment(
      scope,
      assignmentId,
      returned + rawToReturn
    );
    if (!claimed) {
      throw new ValidationError('Only open assignments can be cancelled.');
    }

    let rawMovementId: ObjectId | null = null;
    let rawAdjusted = false;

    try {
      if (rawToReturn > 0 && claimed.raw_item_id) {
        await InventoryRepository.adjustStockById(scope, claimed.raw_item_id, rawToReturn);
        rawAdjusted = true;
        const movement = await InventoryRepository.insertStockMovement(scope, {
          company_id: scope.companyId,
          date: new Date().toISOString(),
          type: 'raw_return',
          item_id: claimed.raw_item_id,
          item_name: claimed.raw_item_name || 'Raw material',
          quantity: rawToReturn,
          bill_id: claimed.bill_id ?? null,
          assignment_id: assignmentId,
          worker_id: claimed.worker_id ?? claimed.worker?.toString() ?? null,
          notes: 'Returned upon assignment cancellation',
          created_at: new Date(),
        });
        rawMovementId = movement._id;
      }

      const updated = await WorkersRepository.updateAssignment(scope, assignmentId, {
        status: 'cancelled',
        raw_returned_quantity: returned + rawToReturn,
        updated_at: new Date(),
      });

      if (!updated) throw new NotFoundError('Material assignment not found.');
      return this.serializeAssignment(updated);
    } catch (err) {
      logger.error({ err, assignmentId }, 'Failed to cancel assignment, restoring status to open');
      if (rawAdjusted && claimed.raw_item_id && rawToReturn > 0) {
        await InventoryRepository.adjustStockById(scope, claimed.raw_item_id, -rawToReturn);
        if (rawMovementId) {
          await InventoryRepository.deleteStockMovementById(scope, rawMovementId);
        }
      }
      await WorkersRepository.updateAssignment(scope, assignmentId, {
        status: 'open',
        raw_returned_quantity: returned,
        updated_at: new Date(),
      });
      throw err;
    }
  }

  static async listPayments(scope: TenantScope, workerId: string) {
    if (!ObjectId.isValid(workerId)) throw new ValidationError('Invalid worker id.');

    const worker = await WorkersRepository.findWorkerById(scope, workerId);
    if (!worker) throw new NotFoundError('Worker not found.');

    const payments = await WorkersRepository.findPaymentsByWorker(scope, workerId);
    return payments.map((p) => this.serializePayment(p, worker));
  }

  static async createPayment(scope: TenantScope, workerId: string, data: PaymentInput) {
    if (!ObjectId.isValid(workerId)) throw new ValidationError('Invalid worker id.');

    const worker = await WorkersRepository.findWorkerById(scope, workerId);
    if (!worker) throw new NotFoundError('Worker not found.');

    const units = parseInt(String(data.units_produced ?? 0), 10) || 0;
    const rate = parseFloat(String(data.rate_per_unit ?? 0)) || 0;
    if (units <= 0) throw new ValidationError('Units produced must be a positive number.');
    if (rate <= 0) throw new ValidationError('Rate per unit must be a positive number.');

    const totalOwed = roundPy(units * rate, 2);
    const amountPaid = parseFloat(String(data.amount_paid ?? 0)) || 0;
    if (amountPaid < 0) throw new ValidationError('Amount paid cannot be negative.');
    if (amountPaid > totalOwed) {
      throw new ValidationError(`Amount paid (₹${amountPaid}) cannot exceed the total owed (₹${totalOwed}).`);
    }

    const created = await WorkersRepository.insertPayment(scope, {
      worker: worker._id,
      product_name: (data.product_name ?? '').trim(),
      units_produced: units,
      rate_per_unit: rate,
      amount_paid: amountPaid,
      paid: amountPaid >= totalOwed,
      date: data.date ? new Date(data.date) : new Date(),
      created_at: new Date(),
    });

    return this.serializePayment(created, worker);
  }

  static async recordPartialPayment(scope: TenantScope, paymentId: string, amount: number) {
    if (!ObjectId.isValid(paymentId)) throw new ValidationError('Invalid payment id.');

    const payment = await WorkersRepository.findPaymentById(scope, paymentId);
    if (!payment) throw new NotFoundError('Payment record not found.');

    const totalOwed = roundPy((Number(payment.units_produced) || 0) * (Number(payment.rate_per_unit) || 0), 2);
    if (payment.paid || Number(payment.amount_paid) >= totalOwed) {
      throw new ValidationError('This payment record is already fully paid.');
    }

    if (amount <= 0) {
      throw new ValidationError('Payment amount must be a positive number.');
    }

    const newAmountPaid = roundPy((Number(payment.amount_paid) || 0) + amount, 2);
    const isPaid = newAmountPaid >= totalOwed;

    const updated = await WorkersRepository.updatePayment(scope, paymentId, {
      amount_paid: newAmountPaid,
      paid: isPaid,
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundError('Payment record not found.');

    const rawWorkerId = (updated.worker_id ?? (updated.worker as { _id?: unknown })?._id ?? updated.worker)?.toString();
    const worker = rawWorkerId && ObjectId.isValid(rawWorkerId)
      ? await WorkersRepository.findWorkerById(scope, rawWorkerId)
      : null;

    return this.serializePayment(updated, worker);
  }

  static async markPaymentPaid(scope: TenantScope, paymentId: string) {
    if (!ObjectId.isValid(paymentId)) throw new ValidationError('Invalid payment id.');

    const payment = await WorkersRepository.findPaymentById(scope, paymentId);
    if (!payment) throw new NotFoundError('Payment record not found.');

    const totalOwed = roundPy((Number(payment.units_produced) || 0) * (Number(payment.rate_per_unit) || 0), 2);

    const updated = await WorkersRepository.updatePayment(scope, paymentId, {
      amount_paid: totalOwed,
      paid: true,
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundError('Payment record not found.');

    const rawWorkerId = (updated.worker_id ?? (updated.worker as { _id?: unknown })?._id ?? updated.worker)?.toString();
    const worker = rawWorkerId && ObjectId.isValid(rawWorkerId)
      ? await WorkersRepository.findWorkerById(scope, rawWorkerId)
      : null;

    return this.serializePayment(updated, worker);
  }
}
