export interface BillItem {
  name: string;
  quantity: number;
  rate: number;
  unit: string;
  inventory_item_id?: string | null;
}

export interface BillBuyer {
  name: string;
  address?: string;
  phone?: string;
  gst_number?: string;
}

export interface PaymentRecord {
  amount: number;
  date?: string;
  notes?: string;
}

export interface CostItem {
  amount: number;
  notes?: string;
  date?: string;
}

export interface ReadyToDeliverBatch {
  inventory_item_id?: string;
  item_name?: string;
  quantity: number;
  date?: string;
}

export interface BillLineProgress {
  product_name: string;
  ordered: number;
  targeted: number;
  produced: number;
  shipped: number;
  ready_to_ship: number;
}

export interface ShipmentItem {
  product_name: string;
  quantity: number;
  finished_item_id?: string;
}

export interface ShipmentRecord {
  shipment_id: string;
  date: string;
  notes?: string;
  items: ShipmentItem[];
}

export interface AssignmentBatch {
  batch_id?: string;
  quantity: number;
  date?: string;
  notes?: string;
  synced_to_inventory?: boolean;
}

export interface RawIssue {
  issue_id?: string;
  quantity: number;
  date: string;
  notes?: string;
}

export interface WorkerAssignment {
  id: string;
  worker_id?: string;
  worker_name?: string;
  bill_id?: string;
  material_name: string;
  quantity: number;
  unit?: string;
  price_per_unit?: number;
  wage_amount?: number;
  status: "open" | "completed" | "cancelled";
  raw_item_id?: string;
  raw_item_name?: string;
  raw_unit?: string;
  raw_per_unit?: number;
  raw_issues?: RawIssue[];
  raw_issued_quantity?: number;
  raw_returned_quantity?: number;
  produced_quantity?: number;
  delivered_quantity?: number;
  wastage_quantity?: number;
  batches?: AssignmentBatch[];
  date?: string;
  notes?: string;
  completed_at?: string;
}

export interface Bill {
  id: string;
  invoice_number: string;
  bill_type: "kacha" | "pakka";
  workflow?: "order_first" | "legacy";
  buyer?: BillBuyer;
  buyer_name?: string;
  buyer_address?: string;
  buyer_phone?: string;
  gst_number?: string;
  gst_percentage?: number;
  discount?: number;
  products?: BillItem[];
  lines?: BillLineProgress[];
  shipments?: ShipmentRecord[];
  grand_total: number;
  payment_status?: "paid" | "partial" | "unpaid";
  amount_received?: number;
  balance_due?: number;
  over_received?: boolean;
  order_status?: string;
  profit_confirmed?: boolean;
  profit_confirmed_amount?: number;
  shipment_confirmed?: boolean;
  shipment_confirmed_at?: string;
  ready_to_deliver?: ReadyToDeliverBatch[];
  ready_to_deliver_quantity?: number;
  worker_cost_total?: number;
  transportation_cost_total?: number;
  transportation_costs?: CostItem[];
  misc_cost_total?: number;
  misc_costs?: CostItem[];
  created_at?: string;
  payments?: PaymentRecord[];
}

export interface InventoryItemRef {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  selling_price?: number;
  cost_price?: number;
  type?: string;
}

export interface ProfitPreviewResponse {
  revenue_collected: number;
  cost_breakdown: {
    material_cost: number;
    worker_cost: number;
    transportation_cost: number;
    misc_cost: number;
  };
  payment_fraction: number;
  suggested_profit: number;
  lines: {
    item_name: string;
    cost_known: boolean;
  }[];
}
