import { z } from 'zod';
import { INVENTORY_ITEM_TYPES } from '../constants.js';

export const WarehouseSchema = z.object({
  name: z.string().min(1, 'Warehouse name is required.'),
  location: z.string().optional().default(''),
});

export type WarehouseInput = z.infer<typeof WarehouseSchema>;

export const InventoryItemSchema = z.object({
  name: z.string().min(1, 'Item name is required.'),
  unit: z.string().optional().default('pcs'),
  type: z.enum(INVENTORY_ITEM_TYPES).optional().default('finished'),
  selling_price: z.coerce.number().min(0).default(0),
  cost_price: z.coerce.number().min(0).default(0),
  quantity: z.coerce.number().default(0),
  reorder_level: z.coerce.number().min(0).default(0),
  warehouse_id: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
});

export type InventoryItemInput = z.infer<typeof InventoryItemSchema>;
