import { z } from 'zod';

export const ManualUploadSchema = z.object({
  date: z.string().min(1, 'Date is required.'),
  product: z.string().min(1, 'Product is required.'),
  category: z.string().min(1, 'Category is required.'),
  quantity: z.coerce.number().positive('Quantity must be positive.'),
  production_cost: z.coerce.number().min(0, 'Production cost must be non-negative.'),
  selling_price: z.coerce.number().min(0, 'Selling price must be non-negative.'),
  region: z.string().min(1, 'Region is required.'),
  customer_type: z.string().min(1, 'Customer type is required.'),
});

export type ManualUploadInput = z.infer<typeof ManualUploadSchema>;
