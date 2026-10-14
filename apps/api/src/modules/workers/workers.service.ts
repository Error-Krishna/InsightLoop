import { ObjectId } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import { BadRequestError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { roundPy } from '@insightloop/shared';

export class WorkersService {
  private static serializeWorker(worker: any, assignments: any[], payments: any[]) {
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

    const completed = assignments.filter(a => a.status === 'completed');
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
      address: worker.address || '',
      phone: worker.phone || '',
      image_url: worker.image_url || null,
      joining_date: worker.joining_date ? new Date(worker.joining_date).toISOString() : null,
      is_active: worker.is_active !== false,
      material_assigned: totalAssigned,
      material_delivered: totalDelivered,
      pending_amount: roundPy(pendingAmount, 2),
      open_assignments: openCount,
      total_wasted: totalWasted,
      wastage_rate: wastageRate,
      created_at: worker.created_at ? new Date(worker.created_at).toISOString() : null,
      updated_at: worker.updated_at ? new Date(worker.updated_at).toISOString() : null,
    };
  }

  private static serializeAssignment(item: any, worker: any = null) {
    let deliveredQty = 0;
    if (Array.isArray(item.batches)) {
      for (const b of item.batches) deliveredQty += Number(b.quantity) || 0;
    }
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price_per_unit) || 0;
    const balanceQty = Math.max(0, qty - deliveredQty);
    const totalValue = roundPy(qty * price, 2);

    const workerId = (item.worker_id || item.worker?._id || item.worker)?.toString();

    return {
      id: item._id.toString(),
      worker_id: workerId || null,
      material_name: item.material_name,
      quantity: qty,
      price_per_unit: price,
      assignment_date: item.assignment_date ? new Date(item.assignment_date).toISOString() : null,
      notes: item.notes || '',
      batches: (item.batches || []).map((b: any) => ({
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
      bill_id: item.bill_id || null,
      wage_amount: Number(item.wage_amount) || 0,
      pay_record_id: item.pay_record_id || null,
    };
  }

  private static serializePayment(item: any, worker: any = null) {
    const units = Number(item.units_produced) || 0;
    const rate = Number(item.rate_per_unit) || 0;
    const totalAmount = roundPy(units * rate, 2);
    const amountPaid = Number(item.amount_paid) || 0;
    const workerId = (item.worker_id || item.worker?._id || item.worker)?.toString();

    return {
      id: item._id.toString(),
      worker_id: workerId || null,
      worker_name: worker?.name || item.worker?.name || 'Unknown',
      product_name: item.product_name,
      units_produced: units,
      rate_per_unit: rate,
      amount_paid: amountPaid,
      total_amount: totalAmount,
      date: item.date ? new Date(item.date).toISOString() : null,
      paid: item.paid || amountPaid >= totalAmount,
      bill_id: item.bill_id || null,
      source_assignment_id: item.source_assignment_id || null,
    };
  }

  static async listWorkers(companyId: string) {
    const workersCol = getCollection('workers');
    const assignmentsCol = getCollection('material_assignments');
    const paymentsCol = getCollection('pay_records');

    const workers = await workersCol
      .find({ company_id: companyId })
      .sort({ created_at: -1 })
      .toArray();

    const assignments = await assignmentsCol.find({ company_id: companyId }).toArray();
    const payments = await paymentsCol.find({ company_id: companyId }).toArray();

    const assignmentsByWorker = new Map<string, any[]>();
    for (const a of assignments) {
      const wid = (a.worker_id || a.worker?._id || a.worker)?.toString();
      if (wid) {
        if (!assignmentsByWorker.has(wid)) assignmentsByWorker.set(wid, []);
        assignmentsByWorker.get(wid)!.push(a);
      }
    }

    const paymentsByWorker = new Map<string, any[]>();
    for (const p of payments) {
      const wid = (p.worker_id || p.worker?._id || p.worker)?.toString();
      if (wid) {
        if (!paymentsByWorker.has(wid)) paymentsByWorker.set(wid, []);
        paymentsByWorker.get(wid)!.push(p);
      }
    }

    return workers.map(w =>
      this.serializeWorker(
        w,
        assignmentsByWorker.get(w._id.toString()) || [],
        paymentsByWorker.get(w._id.toString()) || []
      )
    );
  }

  static async getWorker(companyId: string, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid worker id.');
    const workersCol = getCollection('workers');
    const assignmentsCol = getCollection('material_assignments');
    const paymentsCol = getCollection('pay_records');

    const worker = await workersCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!worker) throw new NotFoundError('Worker not found.');

    const assignments = await assignmentsCol
      .find({
        company_id: companyId,
        $or: [{ worker_id: id }, { 'worker._id': new ObjectId(id) }, { worker: new ObjectId(id) }],
      })
      .toArray();

    const payments = await paymentsCol
      .find({
        company_id: companyId,
        $or: [{ worker_id: id }, { 'worker._id': new ObjectId(id) }, { worker: new ObjectId(id) }],
      })
      .toArray();

    return this.serializeWorker(worker, assignments, payments);
  }

  static async createWorker(companyId: string, data: any) {
    const name = (data.name || '').trim();
    if (!name) throw new ValidationError('Worker name is required.');

    const workersCol = getCollection('workers');
    const now = new Date();

    const doc = {
      company_id: companyId,
      name,
      age: parseInt(data.age, 10) || 0,
      address: (data.address || '').trim(),
      phone: (data.phone || '').trim(),
      image_url: data.image_url || null,
      joining_date: data.joining_date ? new Date(data.joining_date) : now,
      is_active: data.is_active !== false,
      created_at: now,
      updated_at: now,
    };

    const result = await workersCol.insertOne(doc as any);
    const created = await workersCol.findOne({ _id: result.insertedId });
    return this.serializeWorker(created, [], []);
  }

  static async updateWorker(companyId: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid worker id.');
    const workersCol = getCollection('workers');

    const existing = await workersCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!existing) throw new NotFoundError('Worker not found.');

    const updateFields: Record<string, any> = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) updateFields.name = (data.name || '').trim();
    if (data.age !== undefined) updateFields.age = parseInt(data.age, 10) || 0;
    if (data.address !== undefined) updateFields.address = (data.address || '').trim();
    if (data.phone !== undefined) updateFields.phone = (data.phone || '').trim();
    if (data.image_url !== undefined) updateFields.image_url = data.image_url;
    if (data.is_active !== undefined) updateFields.is_active = Boolean(data.is_active);
    if (data.joining_date !== undefined) updateFields.joining_date = new Date(data.joining_date);

    await workersCol.updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
    return this.getWorker(companyId, id);
  }

  static async deleteWorker(companyId: string, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid worker id.');
    const workersCol = getCollection('workers');
    const assignmentsCol = getCollection('material_assignments');
    const paymentsCol = getCollection('pay_records');

    const existing = await workersCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!existing) throw new NotFoundError('Worker not found.');

    await assignmentsCol.deleteMany({
      company_id: companyId,
      $or: [{ worker_id: id }, { 'worker._id': new ObjectId(id) }, { worker: new ObjectId(id) }],
    });

    await paymentsCol.deleteMany({
      company_id: companyId,
      $or: [{ worker_id: id }, { 'worker._id': new ObjectId(id) }, { worker: new ObjectId(id) }],
    });

    await workersCol.deleteOne({ _id: new ObjectId(id) });
  }

  static async listMaterials(companyId: string, workerId: string) {
    if (!ObjectId.isValid(workerId)) throw new ValidationError('Invalid worker id.');
    const assignmentsCol = getCollection('material_assignments');

    const assignments = await assignmentsCol
      .find({
        company_id: companyId,
        $or: [{ worker_id: workerId }, { 'worker._id': new ObjectId(workerId) }, { worker: new ObjectId(workerId) }],
      })
      .sort({ assignment_date: -1 })
      .toArray();

    return assignments.map(a => this.serializeAssignment(a));
  }

  static async createMaterial(companyId: string, workerId: string, data: any) {
    if (!ObjectId.isValid(workerId)) throw new ValidationError('Invalid worker id.');
    const workersCol = getCollection('workers');
    const assignmentsCol = getCollection('material_assignments');
    const billsCol = getCollection('bills');

    const worker = await workersCol.findOne({ _id: new ObjectId(workerId), company_id: companyId });
    if (!worker) throw new NotFoundError('Worker not found.');

    if (data.bill_id) {
      if (!ObjectId.isValid(data.bill_id)) throw new ValidationError('Invalid bill id.');
      const bill = await billsCol.findOne({ _id: new ObjectId(data.bill_id), company_id: companyId });
      if (!bill) throw new ValidationError('That bill was not found for this company.');
    }

    const materialName = (data.material_name || '').trim();
    if (!materialName) throw new ValidationError('Material name is required.');

    const qty = parseFloat(data.quantity) || 0;
    if (qty <= 0) throw new ValidationError('Quantity must be a positive number.');

    const doc = {
      company_id: companyId,
      worker: { _id: worker._id, name: worker.name },
      worker_id: worker._id.toString(),
      material_name: materialName,
      quantity: qty,
      price_per_unit: parseFloat(data.price_per_unit) || 0,
      assignment_date: data.date ? new Date(data.date) : new Date(),
      notes: (data.notes || '').trim(),
      batches: data.batches || [],
      status: 'open',
      wage_amount: parseFloat(data.wage_amount) || 0,
      bill_id: data.bill_id || null,
      created_at: new Date(),
    };

    const result = await assignmentsCol.insertOne(doc as any);
    const created = await assignmentsCol.findOne({ _id: result.insertedId });
    return this.serializeAssignment(created, worker);
  }

  static async addBatch(companyId: string, assignmentId: string, data: any) {
    if (!ObjectId.isValid(assignmentId)) throw new ValidationError('Invalid material assignment id.');
    const assignmentsCol = getCollection('material_assignments');

    const assignment = await assignmentsCol.findOne({
      _id: new ObjectId(assignmentId),
      company_id: companyId,
    });
    if (!assignment) throw new NotFoundError('Material assignment not found.');

    if (assignment.status === 'completed') {
      throw new ValidationError('Cannot add batches to a completed assignment.');
    }

    const qty = parseFloat(data.quantity) || 0;
    if (qty <= 0) throw new ValidationError('Quantity must be a positive number.');

    const batch = {
      quantity: qty,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: (data.notes || '').trim(),
    };

    await assignmentsCol.updateOne(
      { _id: new ObjectId(assignmentId) },
      { $push: { batches: batch } as any }
    );

    const updated = await assignmentsCol.findOne({ _id: new ObjectId(assignmentId) });
    return this.serializeAssignment(updated);
  }

  static async completeAssignment(companyId: string, assignmentId: string) {
    if (!ObjectId.isValid(assignmentId)) throw new ValidationError('Invalid material assignment id.');
    const assignmentsCol = getCollection('material_assignments');
    const itemsCol = getCollection('inventory_items');
    const paymentsCol = getCollection('pay_records');
    const billsCol = getCollection('bills');

    const assignment = await assignmentsCol.findOne({
      _id: new ObjectId(assignmentId),
      company_id: companyId,
    });
    if (!assignment) throw new NotFoundError('Material assignment not found.');

    // Preserved Django quirk: re-completing already completed assignment returns 400
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
      await itemsCol.updateOne(
        {
          company_id: companyId,
          type: 'finished',
          name: { $regex: new RegExp(`^${assignment.material_name}$`, 'i') },
        },
        { $inc: { quantity: deliveredQty } }
      );
      await assignmentsCol.updateOne(
        { _id: new ObjectId(assignmentId) },
        { $set: { synced_to_inventory: true } }
      );
    }

    // Step 2: Auto pay record (resumable)
    let payRecordId = assignment.pay_record_id;
    if (!payRecordId && Number(assignment.wage_amount) > 0) {
      const workerId = (assignment.worker_id || assignment.worker?._id || assignment.worker)?.toString();
      const workerRef = workerId && ObjectId.isValid(workerId) ? new ObjectId(workerId) : assignment.worker;
      const payRecordDoc = {
        company_id: companyId,
        worker: workerRef,
        worker_id: workerId,
        product_name: assignment.material_name,
        units_produced: 1,
        rate_per_unit: Number(assignment.wage_amount),
        amount_paid: 0,
        paid: false,
        date: new Date(),
        bill_id: assignment.bill_id || null,
        source_assignment_id: assignmentId,
        created_at: new Date(),
      };
      const res = await paymentsCol.insertOne(payRecordDoc as any);
      payRecordId = res.insertedId.toString();
      await assignmentsCol.updateOne(
        { _id: new ObjectId(assignmentId) },
        { $set: { pay_record_id: payRecordId } }
      );
    }

    // Step 3: Mark complete
    const completedAt = new Date();
    await assignmentsCol.updateOne(
      { _id: new ObjectId(assignmentId) },
      {
        $set: {
          status: 'completed',
          completed_at: completedAt,
          wastage_quantity: wastageQty,
        },
      }
    );

    // Step 4: Link to bill if linked
    if (assignment.bill_id && ObjectId.isValid(assignment.bill_id)) {
      await billsCol.updateOne(
        { _id: new ObjectId(assignment.bill_id), company_id: companyId },
        { $addToSet: { worker_assignment_ids: assignmentId } as any }
      );
    }

    const updated = await assignmentsCol.findOne({ _id: new ObjectId(assignmentId) });
    return this.serializeAssignment(updated);
  }

  static async listPayments(companyId: string, workerId: string) {
    if (!ObjectId.isValid(workerId)) throw new ValidationError('Invalid worker id.');
    const paymentsCol = getCollection('pay_records');
    const workersCol = getCollection('workers');

    const [worker, payments] = await Promise.all([
      workersCol.findOne({ _id: new ObjectId(workerId), company_id: companyId }),
      paymentsCol
        .find({
          company_id: companyId,
          $or: [{ worker_id: workerId }, { 'worker._id': new ObjectId(workerId) }, { worker: new ObjectId(workerId) }],
        })
        .sort({ date: -1 })
        .toArray(),
    ]);

    return payments.map(p => this.serializePayment(p, worker));
  }

  static async createPayment(companyId: string, workerId: string, data: any) {
    if (!ObjectId.isValid(workerId)) throw new ValidationError('Invalid worker id.');
    const workersCol = getCollection('workers');
    const paymentsCol = getCollection('pay_records');

    const worker = await workersCol.findOne({ _id: new ObjectId(workerId), company_id: companyId });
    if (!worker) throw new NotFoundError('Worker not found.');

    const units = parseInt(data.units_produced, 10) || 0;
    const rate = parseFloat(data.rate_per_unit) || 0;
    if (units <= 0) throw new ValidationError('Units produced must be a positive number.');
    if (rate <= 0) throw new ValidationError('Rate per unit must be a positive number.');

    const totalOwed = roundPy(units * rate, 2);
    const amountPaid = parseFloat(data.amount_paid) || 0;
    if (amountPaid < 0) throw new ValidationError('Amount paid cannot be negative.');
    if (amountPaid > totalOwed) {
      throw new ValidationError(`Amount paid (₹${amountPaid}) cannot exceed the total owed (₹${totalOwed}).`);
    }

    const doc = {
      company_id: companyId,
      worker: worker._id,
      worker_id: worker._id.toString(),
      product_name: (data.product_name || '').trim(),
      units_produced: units,
      rate_per_unit: rate,
      amount_paid: amountPaid,
      paid: amountPaid >= totalOwed,
      date: data.date ? new Date(data.date) : new Date(),
      created_at: new Date(),
    };

    const result = await paymentsCol.insertOne(doc as any);
    const created = await paymentsCol.findOne({ _id: result.insertedId });
    return this.serializePayment(created, worker);
  }

  static async recordPartialPayment(companyId: string, paymentId: string, amount: number) {
    if (!ObjectId.isValid(paymentId)) throw new ValidationError('Invalid payment id.');
    const paymentsCol = getCollection('pay_records');

    const payment = await paymentsCol.findOne({ _id: new ObjectId(paymentId), company_id: companyId });
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

    await paymentsCol.updateOne(
      { _id: new ObjectId(paymentId) },
      {
        $set: {
          amount_paid: newAmountPaid,
          paid: isPaid,
          updated_at: new Date(),
        },
      }
    );

    const updated = await paymentsCol.findOne({ _id: new ObjectId(paymentId) });
    const workersCol = getCollection('workers');
    const workerId = (updated?.worker || updated?.worker_id)?.toString();
    const worker = workerId && ObjectId.isValid(workerId)
      ? await workersCol.findOne({ _id: new ObjectId(workerId) })
      : null;
    return this.serializePayment(updated, worker);
  }

  static async markPaymentPaid(companyId: string, paymentId: string) {
    if (!ObjectId.isValid(paymentId)) throw new ValidationError('Invalid payment id.');
    const paymentsCol = getCollection('pay_records');

    const payment = await paymentsCol.findOne({ _id: new ObjectId(paymentId), company_id: companyId });
    if (!payment) throw new NotFoundError('Payment record not found.');

    const totalOwed = roundPy((Number(payment.units_produced) || 0) * (Number(payment.rate_per_unit) || 0), 2);

    await paymentsCol.updateOne(
      { _id: new ObjectId(paymentId) },
      {
        $set: {
          amount_paid: totalOwed,
          paid: true,
          updated_at: new Date(),
        },
      }
    );

    const updated = await paymentsCol.findOne({ _id: new ObjectId(paymentId) });
    const workersCol = getCollection('workers');
    const workerId = (updated?.worker || updated?.worker_id)?.toString();
    const worker = workerId && ObjectId.isValid(workerId)
      ? await workersCol.findOne({ _id: new ObjectId(workerId) })
      : null;
    return this.serializePayment(updated, worker);
  }
}
