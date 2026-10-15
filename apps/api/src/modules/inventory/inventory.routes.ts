import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

// 1. Warehouses
inventoryRouter.get('/warehouses', asyncHandler(InventoryController.listWarehouses));
inventoryRouter.post('/warehouses', asyncHandler(InventoryController.createWarehouse));
inventoryRouter.put('/warehouses/:id', asyncHandler(InventoryController.updateWarehouse));
inventoryRouter.delete('/warehouses/:id', asyncHandler(InventoryController.deleteWarehouse));

// 2. Meta (warehouse-summary)
inventoryRouter.get('/meta/warehouse-summary', asyncHandler(InventoryController.getWarehouseSummary));
inventoryRouter.get('/warehouse-summary', asyncHandler(InventoryController.getWarehouseSummary));

// 3. Finished Inventory
inventoryRouter.get('/finished', asyncHandler(InventoryController.listFinished));
inventoryRouter.post('/finished', asyncHandler(InventoryController.createFinished));
inventoryRouter.put('/finished/:id', asyncHandler(InventoryController.updateFinished));
inventoryRouter.delete('/finished/:id', asyncHandler(InventoryController.deleteFinished));

// 4. Semi-finished Inventory (including /live)
inventoryRouter.get('/semi-finished/live', asyncHandler(InventoryController.getLiveSemiFinished));
inventoryRouter.get('/semi-finished', asyncHandler(InventoryController.listSemiFinished));
inventoryRouter.post('/semi-finished', asyncHandler(InventoryController.createSemiFinished));
inventoryRouter.put('/semi-finished/:id', asyncHandler(InventoryController.updateSemiFinished));
inventoryRouter.delete('/semi-finished/:id', asyncHandler(InventoryController.deleteSemiFinished));

// 5. Raw Materials Inventory
inventoryRouter.get('/raw', asyncHandler(InventoryController.listRaw));
inventoryRouter.post('/raw', asyncHandler(InventoryController.createRaw));
inventoryRouter.put('/raw/:id', asyncHandler(InventoryController.updateRaw));
inventoryRouter.delete('/raw/:id', asyncHandler(InventoryController.deleteRaw));
