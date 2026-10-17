import { z } from 'zod';

export const WorkerSchema = z.object({
  name: z.string().min(1, 'Worker name is required.'),
  age: z.coerce.number().optional().default(0),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  image_url: z.string().nullable().optional(),
  joining_date: z.string().optional(),
  is_active: z.boolean().optional().default(true),
});

export type WorkerInput = z.infer<typeof WorkerSchema>;

export const MaterialAssignmentSchema = z.object({
  material_name: z.string().min(1, 'Material name is required.'),
  quantity: z.coerce.number().positive('Quantity must be positive.'),
  price_per_unit: z.coerce.number().min(0).default(0),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
  wage_amount: z.coerce.number().min(0).default(0),
  bill_id: z.string().nullable().optional(),
});

export type MaterialAssignmentInput = z.infer<typeof MaterialAssignmentSchema>;

export const MaterialBatchSchema = z.object({
  quantity: z.coerce.number().positive('Batch quantity must be positive.'),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
});

export type MaterialBatchInput = z.infer<typeof MaterialBatchSchema>;

export const PayRecordSchema = z.object({
  product_name: z.string().min(1, 'Product name is required.'),
  units_produced: z.coerce.number().min(0).default(0),
  rate_per_unit: z.coerce.number().min(0).default(0),
  amount_paid: z.coerce.number().min(0).default(0),
  date: z.string().optional(),
});

export type PayRecordInput = z.infer<typeof PayRecordSchema>;
