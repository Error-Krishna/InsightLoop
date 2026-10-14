import { Router, type Request, type Response } from 'express';
import { InventoryService } from './inventory.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

// 1. Warehouses
inventoryRouter.get(
  '/warehouses',
  asyncHandler(async (req: Request, res: Response) => {
    const list = await InventoryService.listWarehouses(req.companyId!);
    res.status(200).json(list);
  })
);

inventoryRouter.post(
  '/warehouses',
  asyncHandler(async (req: Request, res: Response) => {
    const item = await InventoryService.createWarehouse(req.companyId!, req.body);
    res.status(201).json(item);
  })
);

inventoryRouter.put(
  '/warehouses/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = await InventoryService.updateWarehouse(req.companyId!, id, req.body);
    res.status(200).json(item);
  })
);

inventoryRouter.delete(
  '/warehouses/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await InventoryService.deleteWarehouse(req.companyId!, id);
    res.status(204).send();
  })
);

// 2. Meta (warehouse-summary)
inventoryRouter.get(
  '/meta/warehouse-summary',
  asyncHandler(async (req: Request, res: Response) => {
    const summary = await InventoryService.getWarehouseSummary(req.companyId!);
    res.status(200).json(summary);
  })
);

inventoryRouter.get(
  '/warehouse-summary',
  asyncHandler(async (req: Request, res: Response) => {
    const summary = await InventoryService.getWarehouseSummary(req.companyId!);
    res.status(200).json(summary);
  })
);

// 3. Finished Inventory
inventoryRouter.get(
  '/finished',
  asyncHandler(async (req: Request, res: Response) => {
    const items = await InventoryService.listItems(req.companyId!, 'finished');
    res.status(200).json(items);
  })
);

inventoryRouter.post(
  '/finished',
  asyncHandler(async (req: Request, res: Response) => {
    const item = await InventoryService.createItem(req.companyId!, 'finished', req.body);
    res.status(201).json(item);
  })
);

inventoryRouter.put(
  '/finished/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = await InventoryService.updateItem(req.companyId!, 'finished', id, req.body);
    res.status(200).json(item);
  })
);

inventoryRouter.delete(
  '/finished/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await InventoryService.deleteItem(req.companyId!, 'finished', id);
    res.status(204).send();
  })
);

// 4. Semi-finished Inventory (including /live)
inventoryRouter.get(
  '/semi-finished/live',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await InventoryService.getLiveSemiFinished(req.companyId!);
    res.status(200).json(result);
  })
);

inventoryRouter.get(
  '/semi-finished',
  asyncHandler(async (req: Request, res: Response) => {
    const items = await InventoryService.listItems(req.companyId!, 'semi_finished');
    res.status(200).json(items);
  })
);

inventoryRouter.post(
  '/semi-finished',
  asyncHandler(async (req: Request, res: Response) => {
    const item = await InventoryService.createItem(req.companyId!, 'semi_finished', req.body);
    res.status(201).json(item);
  })
);

inventoryRouter.put(
  '/semi-finished/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = await InventoryService.updateItem(req.companyId!, 'semi_finished', id, req.body);
    res.status(200).json(item);
  })
);

inventoryRouter.delete(
  '/semi-finished/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await InventoryService.deleteItem(req.companyId!, 'semi_finished', id);
    res.status(204).send();
  })
);

// 5. Raw Materials Inventory
inventoryRouter.get(
  '/raw',
  asyncHandler(async (req: Request, res: Response) => {
    const items = await InventoryService.listItems(req.companyId!, 'raw');
    res.status(200).json(items);
  })
);

inventoryRouter.post(
  '/raw',
  asyncHandler(async (req: Request, res: Response) => {
    const item = await InventoryService.createItem(req.companyId!, 'raw', req.body);
    res.status(201).json(item);
  })
);

inventoryRouter.put(
  '/raw/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const item = await InventoryService.updateItem(req.companyId!, 'raw', id, req.body);
    res.status(200).json(item);
  })
);

inventoryRouter.delete(
  '/raw/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await InventoryService.deleteItem(req.companyId!, 'raw', id);
    res.status(204).send();
  })
);
