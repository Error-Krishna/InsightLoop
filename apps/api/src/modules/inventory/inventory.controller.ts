import type { Request, Response } from 'express';
import { InventoryService, type ItemInput, type WarehouseInput } from './inventory.service.js';
import type { TenantScope } from '../../types/tenant.js';

export class InventoryController {
  // Warehouses
  static async listWarehouses(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const list = await InventoryService.listWarehouses(scope);
    res.status(200).json(list);
  }

  static async createWarehouse(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const item = await InventoryService.createWarehouse(scope, req.body as WarehouseInput);
    res.status(201).json(item);
  }

  static async updateWarehouse(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const item = await InventoryService.updateWarehouse(scope, id, req.body as WarehouseInput);
    res.status(200).json(item);
  }

  static async deleteWarehouse(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    await InventoryService.deleteWarehouse(scope, id);
    res.status(204).send();
  }

  // Warehouse Summary
  static async getWarehouseSummary(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const summary = await InventoryService.getWarehouseSummary(scope);
    res.status(200).json(summary);
  }

  // Items (finished, semi_finished, raw)
  static async listFinished(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const items = await InventoryService.listItems(scope, 'finished');
    res.status(200).json(items);
  }

  static async updateFinished(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const item = await InventoryService.updateItem(scope, 'finished', id, req.body as ItemInput);
    res.status(200).json(item);
  }

  // Semi-finished / In-Progress (Live only)
  static async listSemiFinished(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const items = await InventoryService.listItems(scope, 'semi_finished');
    res.status(200).json(items);
  }

  static async getLiveSemiFinished(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const result = await InventoryService.getLiveSemiFinished(scope);
    res.status(200).json(result);
  }

  // Stock Movements Ledger (Read-only)
  static async listMovements(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const billId = typeof req.query.bill_id === 'string' ? req.query.bill_id : undefined;
    const movements = await InventoryService.listMovements(scope, billId);
    res.status(200).json(movements);
  }

  // Raw
  static async listRaw(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const items = await InventoryService.listItems(scope, 'raw');
    res.status(200).json(items);
  }

  static async createRaw(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const item = await InventoryService.createItem(scope, 'raw', req.body as ItemInput);
    res.status(201).json(item);
  }

  static async updateRaw(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    const item = await InventoryService.updateItem(scope, 'raw', id, req.body as ItemInput);
    res.status(200).json(item);
  }

  static async deleteRaw(req: Request, res: Response): Promise<void> {
    const scope: TenantScope = { companyId: req.companyId! };
    const id = req.params.id as string;
    await InventoryService.deleteItem(scope, 'raw', id);
    res.status(204).send();
  }
}
