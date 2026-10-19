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
  bill_id: z.string().min(1, 'bill_id is required.'),
  material_name: z.string().min(1, 'material_name is required.'),
  quantity: z.coerce.number().int('quantity must be an integer.').positive('quantity must be positive.'),
  raw_item_id: z.string().min(1, 'raw_item_id is required.'),
  raw_per_unit: z.coerce.number().positive('raw_per_unit must be positive.').optional().default(1),
  issue_quantity: z.coerce.number().min(0, 'issue_quantity must be non-negative.').optional(),
  price_per_unit: z.coerce.number().min(0, 'price_per_unit must be non-negative.').optional(),
  wage_amount: z.coerce.number().min(0, 'wage_amount cannot be negative.').optional().default(0),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
});

export type MaterialAssignmentInput = z.infer<typeof MaterialAssignmentSchema>;

export const MaterialBatchSchema = z.object({
  quantity: z.coerce.number().int('Batch quantity must be an integer.').positive('Batch quantity must be positive.'),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
});

export type MaterialBatchInput = z.infer<typeof MaterialBatchSchema>;

export const RawIssueSchema = z.object({
  quantity: z.coerce.number().positive('Quantity must be positive.'),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
});

export type RawIssueInput = z.infer<typeof RawIssueSchema>;

export const CompleteAssignmentSchema = z.object({
  raw_returned_quantity: z.coerce.number().min(0, 'raw_returned_quantity must be non-negative.').optional().default(0),
});

export type CompleteAssignmentInput = z.infer<typeof CompleteAssignmentSchema>;

export const PayRecordSchema = z.object({
  product_name: z.string().min(1, 'Product name is required.'),
  units_produced: z.coerce.number().min(0).default(0),
  rate_per_unit: z.coerce.number().min(0).default(0),
  amount_paid: z.coerce.number().min(0).default(0),
  date: z.string().optional(),
});

export type PayRecordInput = z.infer<typeof PayRecordSchema>;
