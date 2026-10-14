import { ObjectId } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { roundPy } from '@insightloop/shared';

export class InventoryService {
  private static serializeItem(item: any, warehouse: any = null) {
    return {
      id: item._id.toString(),
      name: item.name,
      unit: item.unit || 'pcs',
      type: item.type,
      selling_price: Number(item.selling_price) || 0,
      cost_price: Number(item.cost_price) || 0,
      quantity: Number(item.quantity) || 0,
      reorder_level: Number(item.reorder_level) || 0,
      warehouse_id: item.warehouse_id || null,
      warehouse_name: warehouse?.name || null,
      image_url: item.image_url || null,
      sku: item.sku || '',
      status: (Number(item.quantity) || 0) <= 0 ? 'Out of Stock' : 'In Stock',
      created_at: item.created_at ? new Date(item.created_at).toISOString() : null,
      updated_at: item.updated_at ? new Date(item.updated_at).toISOString() : null,
    };
  }

  private static serializeWarehouse(wh: any) {
    return {
      id: wh._id.toString(),
      name: wh.name,
      location: wh.location || '',
      created_at: wh.created_at ? new Date(wh.created_at).toISOString() : null,
    };
  }

  static async getNextSku(companyId: string): Promise<string> {
    const countersCol = getCollection('counters');
    const itemsCol = getCollection('inventory_items');

    const counterId = `sku_${companyId}`;
    let counter = await countersCol.findOne({ _id: counterId as any });

    if (!counter) {
      // Find highest existing sequence for company
      const lastItem = await itemsCol
        .find({ company_id: companyId, sku: { $regex: /^SKU-\d+$/ } })
        .sort({ sku: -1 })
        .limit(1)
        .toArray();

      let startingSeq = 0;
      if (lastItem.length > 0 && lastItem[0].sku) {
        const match = lastItem[0].sku.match(/^SKU-(\d+)$/);
        if (match) startingSeq = parseInt(match[1], 10);
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
    return `SKU-${String(seq).padStart(5, '0')}`;
  }

  static async listItems(companyId: string, itemType: string) {
    const itemsCol = getCollection('inventory_items');
    const warehousesCol = getCollection('warehouses');

    const items = await itemsCol
      .find({ company_id: companyId, type: itemType })
      .sort({ updated_at: -1, _id: -1 })
      .toArray();

    const warehouseIds = [...new Set(items.map(i => i.warehouse_id).filter(Boolean))].map(
      id => (ObjectId.isValid(id) ? new ObjectId(id) : id)
    );

    const warehouses = await warehousesCol.find({ _id: { $in: warehouseIds as any } }).toArray();
    const whMap = new Map(warehouses.map(w => [w._id.toString(), w]));

    return items.map(item => this.serializeItem(item, whMap.get(String(item.warehouse_id))));
  }

  static async createItem(companyId: string, itemType: string, data: any) {
    const itemsCol = getCollection('inventory_items');
    const warehousesCol = getCollection('warehouses');

    const name = (data.name || '').trim();
    if (!name) {
      throw new ValidationError('Item name is required.');
    }

    const sku = await this.getNextSku(companyId);
    const now = new Date();

    const doc = {
      company_id: companyId,
      type: itemType,
      name,
      unit: data.unit || 'pcs',
      selling_price: parseFloat(data.selling_price) || 0,
      cost_price: parseFloat(data.cost_price) || 0,
      quantity: parseFloat(data.quantity) || 0,
      reorder_level: parseFloat(data.reorder_level) || 0,
      warehouse_id: data.warehouse_id || null,
      image_url: data.image_url || null,
      sku,
      created_at: now,
      updated_at: now,
    };

    const result = await itemsCol.insertOne(doc as any);
    const saved = await itemsCol.findOne({ _id: result.insertedId });

    let warehouse = null;
    if (saved?.warehouse_id && ObjectId.isValid(saved.warehouse_id)) {
      warehouse = await warehousesCol.findOne({ _id: new ObjectId(saved.warehouse_id) });
    }

    return this.serializeItem(saved, warehouse);
  }

  static async updateItem(companyId: string, itemType: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) {
      throw new ValidationError('Invalid id.');
    }

    const itemsCol = getCollection('inventory_items');
    const warehousesCol = getCollection('warehouses');

    const existing = await itemsCol.findOne({
      _id: new ObjectId(id),
      company_id: companyId,
      type: itemType,
    });

    if (!existing) {
      throw new NotFoundError('Inventory item not found.');
    }

    const updateFields: Record<string, any> = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) updateFields.name = data.name;
    if (data.unit !== undefined) updateFields.unit = data.unit;
    if (data.selling_price !== undefined) updateFields.selling_price = parseFloat(data.selling_price) || 0;
    if (data.cost_price !== undefined) updateFields.cost_price = parseFloat(data.cost_price) || 0;
    if (data.quantity !== undefined) updateFields.quantity = parseFloat(data.quantity) || 0;
    if (data.reorder_level !== undefined) updateFields.reorder_level = parseFloat(data.reorder_level) || 0;
    if (data.warehouse_id !== undefined) updateFields.warehouse_id = data.warehouse_id;
    if (data.image_url !== undefined) updateFields.image_url = data.image_url;

    await itemsCol.updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
    const updated = await itemsCol.findOne({ _id: new ObjectId(id) });

    let warehouse = null;
    if (updated?.warehouse_id && ObjectId.isValid(updated.warehouse_id)) {
      warehouse = await warehousesCol.findOne({ _id: new ObjectId(updated.warehouse_id) });
    }

    return this.serializeItem(updated, warehouse);
  }

  static async deleteItem(companyId: string, itemType: string, id: string) {
    if (!ObjectId.isValid(id)) {
      throw new ValidationError('Invalid id.');
    }

    const itemsCol = getCollection('inventory_items');
    const existing = await itemsCol.findOne({
      _id: new ObjectId(id),
      company_id: companyId,
      type: itemType,
    });

    if (!existing) {
      throw new NotFoundError('Inventory item not found.');
    }

    await itemsCol.deleteOne({ _id: new ObjectId(id) });
  }

  static async getLiveSemiFinished(companyId: string) {
    const itemsCol = getCollection('inventory_items');
    const assignmentsCol = getCollection('material_assignments');
    const workersCol = getCollection('workers');
    const billsCol = getCollection('bills');

    const manualItems = await this.listItems(companyId, 'semi_finished');
    const manualRows = manualItems.map(item => ({ ...item, source: 'manual' }));

    const openAssignments = await assignmentsCol
      .find({ company_id: companyId, status: 'open' })
      .sort({ assignment_date: -1 })
      .toArray();

    const workerIds = [...new Set(openAssignments.map(a => a.worker_id || a.worker).filter(Boolean))].map(
      id => (ObjectId.isValid(id) ? new ObjectId(id) : id)
    );
    const workers = await workersCol.find({ _id: { $in: workerIds as any } }).toArray();
    const workerMap = new Map(workers.map(w => [w._id.toString(), w]));

    const derivedRows = [];
    for (const assignment of openAssignments) {
      let orderInfo = null;
      if (assignment.bill_id && ObjectId.isValid(assignment.bill_id)) {
        const bill = await billsCol.findOne({
          _id: new ObjectId(assignment.bill_id),
          company_id: companyId,
        });
        if (bill) {
          orderInfo = {
            bill_id: bill._id.toString(),
            invoice_number: bill.invoice_number,
            order_status: bill.order_status,
            buyer_name: bill.buyer?.name || null,
          };
        }
      }

      const workerId = (assignment.worker_id || assignment.worker?._id || assignment.worker)?.toString();
      const worker = workerId ? workerMap.get(workerId) : null;
      const workerName = worker?.name || assignment.worker?.name || null;

      let deliveredQty = 0;
      if (Array.isArray(assignment.batches)) {
        for (const b of assignment.batches) {
          deliveredQty += Number(b.quantity) || 0;
        }
      }
      const balanceQty = Math.max(0, (Number(assignment.quantity) || 0) - deliveredQty);

      derivedRows.push({
        id: `assignment:${assignment._id.toString()}`,
        source: 'assignment',
        assignment_id: assignment._id.toString(),
        name: assignment.material_name,
        unit: 'pcs',
        type: 'semi_finished',
        assigned_quantity: Number(assignment.quantity) || 0,
        delivered_quantity: deliveredQty,
        balance_quantity: balanceQty,
        quantity: balanceQty,
        location_label: workerName ? `With ${workerName}` : 'Worker unassigned',
        worker_id: workerId || null,
        worker_name: workerName,
        order: orderInfo,
        assignment_date: assignment.assignment_date ? new Date(assignment.assignment_date).toISOString() : null,
      });
    }

    return {
      manual_items: manualRows,
      in_production: derivedRows,
    };
  }

  static async listWarehouses(companyId: string) {
    const warehousesCol = getCollection('warehouses');
    const warehouses = await warehousesCol.find({ company_id: companyId }).sort({ name: 1 }).toArray();
    return warehouses.map(w => this.serializeWarehouse(w));
  }

  static async createWarehouse(companyId: string, data: any) {
    const warehousesCol = getCollection('warehouses');
    const name = (data.name || '').trim();
    if (!name) {
      throw new ValidationError('Warehouse name is required.');
    }

    const doc = {
      company_id: companyId,
      name,
      location: (data.location || '').trim(),
      created_at: new Date(),
    };

    const result = await warehousesCol.insertOne(doc as any);
    const created = await warehousesCol.findOne({ _id: result.insertedId });
    return this.serializeWarehouse(created);
  }

  static async updateWarehouse(companyId: string, id: string, data: any) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid id.');
    const warehousesCol = getCollection('warehouses');

    const existing = await warehousesCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!existing) throw new NotFoundError('Warehouse not found.');

    const updateFields: Record<string, any> = {};
    if (data.name !== undefined) updateFields.name = (data.name || '').trim();
    if (data.location !== undefined) updateFields.location = (data.location || '').trim();

    await warehousesCol.updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
    const updated = await warehousesCol.findOne({ _id: new ObjectId(id) });
    return this.serializeWarehouse(updated);
  }

  static async deleteWarehouse(companyId: string, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid id.');
    const warehousesCol = getCollection('warehouses');
    const itemsCol = getCollection('inventory_items');

    const existing = await warehousesCol.findOne({ _id: new ObjectId(id), company_id: companyId });
    if (!existing) throw new NotFoundError('Warehouse not found.');

    await itemsCol.updateMany(
      { company_id: companyId, warehouse_id: id },
      { $set: { warehouse_id: null } }
    );
    await warehousesCol.deleteOne({ _id: new ObjectId(id) });
  }

  static async getWarehouseSummary(companyId: string) {
    const warehousesCol = getCollection('warehouses');
    const itemsCol = getCollection('inventory_items');

    const warehouses = await warehousesCol.find({ company_id: companyId }).toArray();
    const summary = [];

    for (const warehouse of warehouses) {
      const items = await itemsCol
        .find({ company_id: companyId, warehouse_id: warehouse._id.toString() })
        .toArray();

      const byType: Record<string, { items_count: number; total_quantity: number; stock_value: number }> = {
        raw: { items_count: 0, total_quantity: 0, stock_value: 0 },
        finished: { items_count: 0, total_quantity: 0, stock_value: 0 },
        semi_finished: { items_count: 0, total_quantity: 0, stock_value: 0 },
      };

      let totalQty = 0;
      let totalStockValue = 0;

      for (const item of items) {
        const itemType = item.type || 'finished';
        const qty = Number(item.quantity) || 0;
        const cost = Number(item.cost_price) || 0;
        const val = qty * cost;

        if (!byType[itemType]) {
          byType[itemType] = { items_count: 0, total_quantity: 0, stock_value: 0 };
        }

        byType[itemType].items_count += 1;
        byType[itemType].total_quantity += qty;
        byType[itemType].stock_value += val;

        totalQty += qty;
        totalStockValue += val;
      }

      for (const t of Object.keys(byType)) {
        byType[t].total_quantity = roundPy(byType[t].total_quantity, 2);
        byType[t].stock_value = roundPy(byType[t].stock_value, 2);
      }

      summary.push({
        warehouse: this.serializeWarehouse(warehouse),
        items_count: items.length,
        total_quantity: roundPy(totalQty, 2),
        stock_value: roundPy(totalStockValue, 2),
        by_type: byType,
      });
    }

    return summary;
  }
}
