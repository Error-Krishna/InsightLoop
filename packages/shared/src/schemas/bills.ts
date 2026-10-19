import { z } from 'zod';
import { BILL_TYPES } from '../constants.js';

export const BillProductSchema = z.object({
  name: z.string().min(1, 'Product name is required.'),
  description: z.string().optional().default(''),
  quantity: z.coerce.number().min(0.001, 'Quantity must be positive.'),
  rate: z.coerce.number().min(0, 'Rate must be non-negative.'),
  unit: z.string().optional().default('pcs'),
  inventory_item_id: z.string().nullable().optional(),
});

export const BillBuyerSchema = z.object({
  name: z.string().min(1, 'Buyer name is required.'),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  gst_number: z.string().optional().default(''),
});

export const CreateBillSchema = z.object({
  bill_type: z.enum(BILL_TYPES).optional().default('kacha'),
  buyer: BillBuyerSchema,
  products: z.array(BillProductSchema).min(1, 'At least one product is required.'),
  discount: z.coerce.number().min(0).default(0),
  gst_percentage: z.coerce.number().min(0).max(100).default(0),
});

export type CreateBillInput = z.infer<typeof CreateBillSchema>;

export const ConvertBillSchema = z.object({
  gst_number: z.string().min(1, 'GST number is required to convert to pakka.'),
  gst_percentage: z.coerce.number().min(0).max(100),
  products: z.array(BillProductSchema).optional(),
});

export type ConvertBillInput = z.infer<typeof ConvertBillSchema>;

export const RecordBillPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be positive.'),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
});

export type RecordBillPaymentInput = z.infer<typeof RecordBillPaymentSchema>;

export const ConfirmProfitSchema = z.object({
  confirmed_amount: z.coerce.number().optional(),
});

export type ConfirmProfitInput = z.infer<typeof ConfirmProfitSchema>;

export const ShipmentItemSchema = z.object({
  product_name: z.string().min(1, 'Product name is required.'),
  quantity: z.coerce.number().positive('Quantity must be positive.'),
});

export const CreateShipmentSchema = z.object({
  items: z.array(ShipmentItemSchema).optional().default([]),
  ship_all: z.boolean().optional().default(false),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
});

export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;

export const TransportationCostSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive.'),
  notes: z.string().optional().default(''),
  date: z.string().optional(),
});

export const MiscCostSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive.'),
  notes: z.string().optional().default(''),
  date: z.string().optional(),
});
