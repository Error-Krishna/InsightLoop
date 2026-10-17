export const BILL_TYPES = ['kacha', 'pakka'] as const;
export type BillType = typeof BILL_TYPES[number];

export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'over_received'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export const ORDER_STATUSES = ['pending', 'partially_delivered', 'delivered', 'closed'] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export const INVENTORY_ITEM_TYPES = ['finished', 'semi_finished', 'raw'] as const;
export type InventoryItemType = typeof INVENTORY_ITEM_TYPES[number];

export const MATERIAL_ASSIGNMENT_STATUSES = ['open', 'completed'] as const;
export type MaterialAssignmentStatus = typeof MATERIAL_ASSIGNMENT_STATUSES[number];

export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  UNAUTHORIZED: 4001,
  COMPANY_MISMATCH: 4002,
} as const;

export const DEFAULT_PAGE_SIZE = 50;
