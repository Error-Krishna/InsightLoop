import { ObjectId } from 'mongodb';
import { InventoryRepository, type InventoryItemDoc, type WarehouseDoc, type InventoryBillDoc } from './inventory.repository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { roundPy } from '@insightloop/shared';
import { formatDjangoIso } from '../../utils/timezone.js';
import type { TenantScope } from '../../types/tenant.js';

export interface ItemInput {
  name?: string;
  unit?: string;
  selling_price?: number | string;
  cost_price?: number | string;
  quantity?: number | string;
  reorder_level?: number | string;
  warehouse_id?: string | null;
  image_url?: string | null;
  sku?: string;
}

export interface WarehouseInput {
  name?: string;
  location?: string;
}

export class InventoryService {
  private static serializeItem(item: InventoryItemDoc, warehouse: WarehouseDoc | null = null) {
    return {
      id: item._id.toString(),
      name: item.name,
      unit: item.unit ?? 'pcs',
      type: item.type,
      selling_price: Number(item.selling_price) || 0,
      cost_price: Number(item.cost_price) || 0,
      quantity: Number(item.quantity) || 0,
      reorder_level: Number(item.reorder_level) || 0,
      warehouse_id: item.warehouse_id ?? null,
      warehouse_name: warehouse?.name ?? null,
      image_url: item.image_url ?? null,
      sku: item.sku ?? '',
      status: (Number(item.quantity) || 0) <= 0 ? 'Out of Stock' : 'In Stock',
      created_at: formatDjangoIso(item.created_at),
      updated_at: formatDjangoIso(item.updated_at),
    };
  }

  private static serializeWarehouse(wh: WarehouseDoc) {
    return {
      id: wh._id.toString(),
      name: wh.name,
      location: wh.location ?? '',
      created_at: formatDjangoIso(wh.created_at),
    };
  }

  static async listItems(scope: TenantScope, itemType: string) {
    const items = await InventoryRepository.findItems(scope, { type: itemType });
    const warehouseIds = [...new Set(items.map((i) => i.warehouse_id).filter(Boolean))] as string[];
    const warehouses = await InventoryRepository.findWarehousesByIds(scope, warehouseIds);
    const whMap = new Map(warehouses.map((w) => [w._id.toString(), w]));

    return items.map((item) => this.serializeItem(item, whMap.get(String(item.warehouse_id)) ?? null));
  }

  static async createItem(scope: TenantScope, itemType: string, data: ItemInput) {
    const name = (data.name ?? '').trim();
    if (!name) {
      throw new ValidationError('Item name is required.');
    }

    const sku = data.sku ? data.sku.trim() : undefined;
    const now = new Date();

    const created = await InventoryRepository.insertItemWithRetry(scope, {
      type: itemType,
      name,
      unit: data.unit ?? 'pcs',
      selling_price: parseFloat(String(data.selling_price ?? 0)) || 0,
      cost_price: parseFloat(String(data.cost_price ?? 0)) || 0,
      quantity: parseFloat(String(data.quantity ?? 0)) || 0,
      reorder_level: parseFloat(String(data.reorder_level ?? 0)) || 0,
      warehouse_id: data.warehouse_id ?? null,
      image_url: data.image_url ?? null,
      sku,
      created_at: now,
      updated_at: now,
    });

    let warehouse: WarehouseDoc | null = null;
    if (created.warehouse_id && ObjectId.isValid(created.warehouse_id)) {
      warehouse = await InventoryRepository.findWarehouseById(scope, created.warehouse_id);
    }

    return this.serializeItem(created, warehouse);
  }

  static async updateItem(scope: TenantScope, itemType: string, id: string, data: ItemInput) {
    if (!ObjectId.isValid(id)) {
      throw new ValidationError('Invalid id.');
    }

    const existing = await InventoryRepository.findItemById(scope, id);
    if (existing?.type !== itemType) {
      throw new NotFoundError('Inventory item not found.');
    }

    const updateFields: Partial<InventoryItemDoc> = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) updateFields.name = data.name;
    if (data.unit !== undefined) updateFields.unit = data.unit;
    if (data.selling_price !== undefined) updateFields.selling_price = parseFloat(String(data.selling_price)) || 0;
    if (data.cost_price !== undefined) updateFields.cost_price = parseFloat(String(data.cost_price)) || 0;
    if (data.quantity !== undefined) {
      if (itemType === 'finished') {
        throw new ValidationError('Finished stock changes only through production and shipments.');
      }
      updateFields.quantity = parseFloat(String(data.quantity)) || 0;
    }
    if (data.reorder_level !== undefined) updateFields.reorder_level = parseFloat(String(data.reorder_level)) || 0;
    if (data.warehouse_id !== undefined) updateFields.warehouse_id = data.warehouse_id;
    if (data.image_url !== undefined) updateFields.image_url = data.image_url;

    const updated = await InventoryRepository.updateItem(scope, id, updateFields);
    if (!updated) {
      throw new NotFoundError('Inventory item not found.');
    }

    let warehouse: WarehouseDoc | null = null;
    if (updated.warehouse_id && ObjectId.isValid(updated.warehouse_id)) {
      warehouse = await InventoryRepository.findWarehouseById(scope, updated.warehouse_id);
    }

    return this.serializeItem(updated, warehouse);
  }

  static async deleteItem(scope: TenantScope, itemType: string, id: string) {
    if (!ObjectId.isValid(id)) {
      throw new ValidationError('Invalid id.');
    }

    const existing = await InventoryRepository.findItemById(scope, id);
    if (existing?.type !== itemType) {
      throw new NotFoundError('Inventory item not found.');
    }

    await InventoryRepository.deleteItem(scope, id);
  }

  static async getLiveSemiFinished(scope: TenantScope) {
    const openAssignments = await InventoryRepository.findOpenAssignments(scope);
    const workerIds = [
      ...new Set(
        openAssignments
          .map((a) => {
            if (a.worker_id) return a.worker_id;
            if (a.worker instanceof ObjectId) return a.worker.toString();
            if (typeof a.worker === 'string') return a.worker;
            return null;
          })
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const workers = await InventoryRepository.findWorkersByIds(scope, workerIds);
    const workerMap = new Map(workers.map((w) => [w._id.toString(), w]));

    const derivedRows = [];
    for (const assignment of openAssignments) {
      let orderInfo: { bill_id: string; invoice_number: string; order_status?: string; buyer_name: string | null } | null = null;
      let bill: InventoryBillDoc | null = null;
      if (assignment.bill_id && ObjectId.isValid(String(assignment.bill_id))) {
        bill = await InventoryRepository.findBillById(scope, String(assignment.bill_id));
        if (bill) {
          orderInfo = {
            bill_id: bill._id.toString(),
            invoice_number: bill.invoice_number ?? '',
            order_status: bill.order_status ?? '',
            buyer_name: bill.buyer?.name ?? null,
          };
        }
      }

      let workerId: string | undefined;
      if (assignment.worker_id) {
        workerId = assignment.worker_id;
      } else if (assignment.worker instanceof ObjectId) {
        workerId = assignment.worker.toString();
      } else if (typeof assignment.worker === 'string') {
        workerId = assignment.worker;
      } else if (assignment.worker && typeof assignment.worker === 'object' && '_id' in assignment.worker && assignment.worker._id) {
        workerId = String(assignment.worker._id);
      }

      const worker = workerId ? workerMap.get(workerId) : null;
      let fallbackWorkerName: string | null = null;
      if (typeof assignment.worker === 'object' && assignment.worker !== null && !(assignment.worker instanceof ObjectId) && 'name' in assignment.worker && typeof assignment.worker.name === 'string') {
        fallbackWorkerName = assignment.worker.name;
      }
      const workerName = worker?.name ?? fallbackWorkerName ?? null;

      let deliveredQty = 0;
      if (assignment.produced_quantity !== undefined && assignment.produced_quantity !== null) {
        deliveredQty = Number(assignment.produced_quantity) || 0;
      } else if (Array.isArray(assignment.batches)) {
        for (const b of assignment.batches) {
          deliveredQty += Number(b.quantity) || 0;
        }
      }

      const target = Number(assignment.quantity) || 0;
      const produced = deliveredQty;
      const remainingOutput = Math.max(0, target - produced);

      const rawIssued = Number(assignment.raw_issued_quantity) || 0;
      const rawReturned = Number(assignment.raw_returned_quantity) || 0;
      const rawPerUnit = Number(assignment.raw_per_unit) || 1;
      const rawWithWorker = Math.max(0, rawIssued - rawReturned - produced * rawPerUnit);

      const matchingProduct = (bill?.products ?? []).find(
        (p: { name?: string; unit?: string }) => (p.name ?? '').trim().toLowerCase() === (assignment.material_name ?? '').trim().toLowerCase()
      );
      const unit = matchingProduct?.unit ?? 'pcs';
      const rawUnit = assignment.raw_unit ?? 'pcs';

      derivedRows.push({
        id: `assignment:${assignment._id.toString()}`,
        source: 'assignment',
        assignment_id: assignment._id.toString(),
        worker_id: workerId ?? null,
        worker_name: workerName,
        bill_id: assignment.bill_id ? String(assignment.bill_id) : null,
        invoice_number: bill?.invoice_number ?? '',
        product_name: assignment.material_name ?? 'Unknown',
        unit,
        raw_item_name: assignment.raw_item_name ?? 'Raw',
        raw_unit: rawUnit,
        raw_issued: rawIssued,
        raw_returned: rawReturned,
        raw_with_worker: rawWithWorker,
        target,
        produced,
        remaining_output: remainingOutput,
        // Compat fields
        name: assignment.material_name ?? 'Unknown',
        type: 'semi_finished',
        assigned_quantity: target,
        delivered_quantity: produced,
        balance_quantity: remainingOutput,
        quantity: remainingOutput,
        location_label: workerName ? `With ${workerName}` : 'Worker unassigned',
        order: orderInfo,
        assignment_date: formatDjangoIso(assignment.assignment_date),
      });
    }

    return {
      in_production: derivedRows,
    };
  }

  static async listMovements(scope: TenantScope, billId?: string) {
    const movements = await InventoryRepository.findStockMovements(scope, billId, 200);
    return movements.map((m) => ({
      id: m._id.toString(),
      company_id: m.company_id,
      date: formatDjangoIso(m.date),
      type: m.type,
      item_id: m.item_id ? m.item_id.toString() : null,
      item_name: m.item_name ?? '',
      quantity: Number(m.quantity) || 0,
      bill_id: m.bill_id ?? null,
      assignment_id: m.assignment_id ?? null,
      worker_id: m.worker_id ?? null,
      notes: m.notes ?? '',
      created_at: formatDjangoIso(m.created_at),
    }));
  }

  static async listWarehouses(scope: TenantScope) {
    const warehouses = await InventoryRepository.findWarehouses(scope);
    return warehouses.map((w) => this.serializeWarehouse(w));
  }

  static async createWarehouse(scope: TenantScope, data: WarehouseInput) {
    const name = (data.name ?? '').trim();
    if (!name) {
      throw new ValidationError('Warehouse name is required.');
    }

    const created = await InventoryRepository.insertWarehouse(scope, {
      name,
      location: (data.location ?? '').trim(),
      created_at: new Date(),
    });

    return this.serializeWarehouse(created);
  }

  static async updateWarehouse(scope: TenantScope, id: string, data: WarehouseInput) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid id.');

    const existing = await InventoryRepository.findWarehouseById(scope, id);
    if (!existing) throw new NotFoundError('Warehouse not found.');

    const updateFields: Partial<WarehouseDoc> = {};
    if (data.name !== undefined) updateFields.name = (data.name ?? '').trim();
    if (data.location !== undefined) updateFields.location = (data.location ?? '').trim();

    const updated = await InventoryRepository.updateWarehouse(scope, id, updateFields);
    if (!updated) throw new NotFoundError('Warehouse not found.');

    return this.serializeWarehouse(updated);
  }

  static async deleteWarehouse(scope: TenantScope, id: string) {
    if (!ObjectId.isValid(id)) throw new ValidationError('Invalid id.');

    const existing = await InventoryRepository.findWarehouseById(scope, id);
    if (!existing) throw new NotFoundError('Warehouse not found.');

    await InventoryRepository.deleteWarehouse(scope, id);
  }

  static async getWarehouseSummary(scope: TenantScope) {
    const warehouses = await InventoryRepository.findWarehouses(scope);
    const summary = [];

    for (const warehouse of warehouses) {
      const items = await InventoryRepository.findItems(scope, { warehouse_id: warehouse._id.toString() });

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
