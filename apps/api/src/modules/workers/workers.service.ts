import { ObjectId } from 'mongodb';
import {
  WorkersRepository,
  type MaterialAssignmentDoc,
  type PayRecordDoc,
  type WorkerDoc,
} from './workers.repository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
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
  material_name?: string;
  quantity?: number | string;
  price_per_unit?: number | string;
  date?: string | Date;
  notes?: string;
  batches?: { quantity: number; date?: string; notes?: string }[];
  wage_amount?: number | string;
  bill_id?: string | null;
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

    const completed = assignments.filter((a) => a.status === 'completed');
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

    let totalAssigned = 0;
    let totalDelivered = 0;
    let openCount = 0;

    for (const a of assignments) {
      totalAssigned += Number(a.quantity) || 0;
      let delivered = 0;
      if (Array.isArray(a.batches)) {
        for (const b of a.batches) delivered += Number(b.quantity) || 0;
      }
      totalDelivered += delivered;
      if (a.status === 'open') openCount += 1;
    }

    return {
      id: worker._id.toString(),
      name: worker.name,
      age: Number(worker.age) || 0,
      address: worker.address ?? '',
      phone: worker.phone ?? '',
      image_url: worker.image_url ?? null,
      joining_date: formatDjangoIso(worker.joining_date),
      is_active: worker.is_active !== false,
      material_assigned: totalAssigned,
      material_delivered: totalDelivered,
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
    const assignments = await WorkersRepository.findAssignments(scope);
    const payments = await WorkersRepository.findPayments(scope);

    const assignmentsByWorker = new Map<string, MaterialAssignmentDoc[]>();
    for (const a of assignments) {
      const wid = (a.worker_id ?? (a.worker as { _id?: unknown })?._id ?? a.worker)?.toString();
      if (wid) {
        if (!assignmentsByWorker.has(wid)) assignmentsByWorker.set(wid, []);
        assignmentsByWorker.get(wid)!.push(a);
      }
    }

    const paymentsByWorker = new Map<string, PayRecordDoc[]>();
    for (const p of payments) {
      const wid = (p.worker_id ?? (p.worker as { _id?: unknown })?._id ?? p.worker)?.toString();
      if (wid) {
        if (!paymentsByWorker.has(wid)) paymentsByWorker.set(wid, []);
        paymentsByWorker.get(wid)!.push(p);
      }
    }

    return workers.map((w) =>
      this.serializeWorker(
        w,
        assignmentsByWorker.get(w._id.toString()) ?? [],
        paymentsByWorker.get(w._id.toString()) ?? []
      )
    );
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
    const created = await WorkersRepository.insertWorker(scope, {
      name,
      age: parseInt(String(data.age ?? 0), 10) || 0,
      address: (data.address ?? '').trim(),
      phone: (data.phone ?? '').trim(),
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
    if (data.age !== undefined) updateFields.age = parseInt(String(data.age), 10) || 0;
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

    if (data.bill_id) {
      if (!ObjectId.isValid(data.bill_id)) throw new ValidationError('Invalid bill id.');
      const bill = await WorkersRepository.findBillById(scope, data.bill_id);
      if (!bill) throw new ValidationError('That bill was not found for this company.');
    }

    const materialName = (data.material_name ?? '').trim();
    if (!materialName) throw new ValidationError('Material name is required.');

    const qty = parseFloat(String(data.quantity ?? 0)) || 0;
    if (qty <= 0) throw new ValidationError('Quantity must be a positive number.');

    const pricePerUnit = parseFloat(String(data.price_per_unit ?? 0)) || 0;
    if (pricePerUnit <= 0) throw new ValidationError('Price per unit must be a positive number.');

    const wageAmount = parseFloat(String(data.wage_amount ?? 0)) || 0;
    if (wageAmount < 0) throw new ValidationError('Wage amount cannot be negative.');

    const created = await WorkersRepository.insertAssignment(scope, {
      worker: worker._id,
      material_name: materialName,
      quantity: qty,
      price_per_unit: pricePerUnit,
      assignment_date: data.date ? new Date(data.date) : new Date(),
      notes: (data.notes ?? '').trim(),
      batches: data.batches ?? [],
      status: 'open',
      wage_amount: wageAmount,
      bill_id: data.bill_id ?? null,
      created_at: new Date(),
    });

    return this.serializeAssignment(created, worker);
  }

  static async addBatch(scope: TenantScope, assignmentId: string, data: BatchInput) {
    if (!ObjectId.isValid(assignmentId)) throw new ValidationError('Invalid material assignment id.');

    const assignment = await WorkersRepository.findAssignmentById(scope, assignmentId);
    if (!assignment) throw new NotFoundError('Material assignment not found.');

    if (assignment.status === 'completed') {
      throw new ValidationError('Cannot add batches to a completed assignment.');
    }

    const qty = parseFloat(String(data.quantity ?? 0)) || 0;
    if (qty <= 0) throw new ValidationError('Quantity must be a positive number.');

    const delivered = (assignment.batches ?? []).reduce((acc, b) => acc + (Number(b.quantity) || 0), 0);
    const balance = assignment.quantity - delivered;
    if (qty > balance) {
      throw new ValidationError(`Cannot add batch: quantity exceeds balance (${balance} units available)`);
    }

    if (data.date && new Date(data.date) > new Date()) {
      throw new ValidationError('Batch date cannot be in the future');
    }

    const batch = {
      quantity: qty,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: (data.notes ?? '').trim(),
    };

    const updated = await WorkersRepository.addBatchToAssignment(scope, assignmentId, batch);
    if (!updated) throw new NotFoundError('Material assignment not found.');

    return this.serializeAssignment(updated);
  }

  static async completeAssignment(scope: TenantScope, assignmentId: string) {
    if (!ObjectId.isValid(assignmentId)) throw new ValidationError('Invalid material assignment id.');

    const assignment = await WorkersRepository.findAssignmentById(scope, assignmentId);
    if (!assignment) throw new NotFoundError('Material assignment not found.');

    if (assignment.status === 'completed') {
      throw new ValidationError('This assignment is already marked complete.');
    }

    let deliveredQty = 0;
    if (Array.isArray(assignment.batches)) {
      for (const b of assignment.batches) deliveredQty += Number(b.quantity) || 0;
    }
    const expectedQty = Number(assignment.quantity) || 0;
    const wastageQty = Math.max(0, expectedQty - deliveredQty);

    // Step 1: Inventory sync (resumable)
    if (!assignment.synced_to_inventory && deliveredQty > 0) {
      await WorkersRepository.syncFinishedInventory(scope, assignment.material_name, deliveredQty);
      await WorkersRepository.updateAssignment(scope, assignmentId, { synced_to_inventory: true });
    }

    // Step 2: Auto pay record (resumable)
    let payRecordId = assignment.pay_record_id;
    if (!payRecordId && Number(assignment.wage_amount) > 0) {
      const rawWorkerId = (assignment.worker_id ?? (assignment.worker as { _id?: unknown })?._id ?? assignment.worker)?.toString();
      const workerRef = rawWorkerId && ObjectId.isValid(rawWorkerId) ? new ObjectId(rawWorkerId) : (assignment.worker as ObjectId);

      const createdPayRecord = await WorkersRepository.insertPayment(scope, {
        worker: workerRef,
        product_name: assignment.material_name,
        units_produced: 1,
        rate_per_unit: Number(assignment.wage_amount),
        amount_paid: 0,
        paid: false,
        date: new Date(),
        bill_id: assignment.bill_id ?? null,
        source_assignment_id: assignmentId,
        created_at: new Date(),
      });
      payRecordId = createdPayRecord._id.toString();
      await WorkersRepository.updateAssignment(scope, assignmentId, { pay_record_id: payRecordId });
    }

    // Step 3: Mark complete
    const completedAt = new Date();
    await WorkersRepository.updateAssignment(scope, assignmentId, {
      status: 'completed',
      completed_at: completedAt,
      wastage_quantity: wastageQty,
    });

    // Step 4: Link to bill if linked
    if (assignment.bill_id && ObjectId.isValid(assignment.bill_id)) {
      await WorkersRepository.linkBillWorkerAssignment(scope, assignment.bill_id, assignmentId);
    }

    const updated = await WorkersRepository.findAssignmentById(scope, assignmentId);
    if (!updated) throw new NotFoundError('Material assignment not found.');
    return this.serializeAssignment(updated);
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
