import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  type: string;
  unit: string;
  quantity: number;
  selling_price: number;
  cost_price: number;
  reorder_level: number;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  image_url?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location?: string;
}

export interface InventoryItemFormData {
  name: string;
  unit: string;
  quantity: number;
  selling_price: number;
  cost_price: number;
  reorder_level: number;
  warehouse_id: string;
  image_url: string;
}

const emptyForm: InventoryItemFormData = {
  name: "",
  unit: "pcs",
  quantity: 0,
  selling_price: 0,
  cost_price: 0,
  reorder_level: 0,
  warehouse_id: "",
  image_url: "",
};

export interface InventoryItemsPageProps {
  itemType: "finished" | "raw";
  title: string;
}

export default function InventoryItemsPage({ itemType, title }: InventoryItemsPageProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [form, setForm] = useState<InventoryItemFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  const load = useCallback(async () => {
    const [itemsResponse, warehousesResponse] = await Promise.all([
      api.get<InventoryItem[]>(`/inventory/${itemType}/`),
      api.get<Warehouse[]>("/inventory/warehouses/"),
    ]);
    setItems(itemsResponse.data);
    setWarehouses(warehousesResponse.data);
  }, [itemType]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !query ||
        [item.name, item.sku, item.warehouse_name].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );
      const isLowStock = Number(item.quantity || 0) <= Number(item.reorder_level || 0);
      return matchesQuery && (!showLowStockOnly || isLowStock);
    });
  }, [items, search, showLowStockOnly]);

  const inventoryStats = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const stockValue = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.cost_price || 0),
      0
    );
    const lowStockCount = items.filter(
      (item) => Number(item.quantity || 0) <= Number(item.reorder_level || 0)
    ).length;
    return { totalQuantity, stockValue, lowStockCount };
  }, [items]);

  useEffect(() => {
    load().catch(() => toast.error(`Failed to load ${title.toLowerCase()}`));
  }, [load, title]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editingId) {
        if (itemType === "finished") {
          await api.put(`/inventory/finished/${editingId}/`, form);
        } else {
          await api.put(`/inventory/raw/${editingId}/`, form);
        }
        toast.success("Inventory item updated");
      } else {
        if (itemType === "raw") {
          await api.post("/inventory/raw/", form);
          toast.success("Inventory item created");
        }
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch {
      toast.error("Unable to save inventory item");
    }
  }

  function startEditing(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      unit: item.unit || "pcs",
      quantity: item.quantity || 0,
      selling_price: item.selling_price || 0,
      cost_price: item.cost_price || 0,
      reorder_level: item.reorder_level || 0,
      warehouse_id: item.warehouse_id || "",
      image_url: item.image_url || "",
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm);
  }

  const formFields: [keyof InventoryItemFormData, string, string][] = [
    ["name", "Name", "text"],
    ["unit", "Unit", "text"],
    ["quantity", "Quantity", "number"],
    ["selling_price", "Selling Price", "number"],
    ["cost_price", "Cost Price", "number"],
    ["reorder_level", "Reorder Level", "number"],
    ["image_url", "Image URL", "text"],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Items" value={items.length} />
        <MetricCard label="Total Quantity" value={inventoryStats.totalQuantity.toLocaleString("en-IN")} />
        <MetricCard label="Stock Value" value={`₹${inventoryStats.stockValue.toLocaleString("en-IN")}`} />
      </div>

      {itemType === "finished" && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-indigo-950">
          <p className="font-bold text-indigo-900">Finished Goods Stock</p>
          <p className="mt-1 font-medium text-indigo-800/90 leading-relaxed">
            Finished goods stock is created through worker production and decremented through shipments.
          </p>
        </div>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Low stock items: {inventoryStats.lowStockCount}
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={cancelEditing}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-2xs transition hover:bg-slate-50"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {(itemType === "raw" || editingId !== null) && (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-3">
            {formFields.map(([key, label, type]) => {
              const isQuantityDisabled = itemType === "finished" && key === "quantity";
              return (
                <label key={key} className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  {label}
                  {isQuantityDisabled && (
                    <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">(managed via production)</span>
                  )}
                  <input
                    type={type}
                    value={form[key]}
                    disabled={isQuantityDisabled}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: type === "number" ? parseFloat(event.target.value) || 0 : event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </label>
              );
            })}
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Warehouse
              <select
                value={form.warehouse_id}
                onChange={(event) => setForm((current) => ({ ...current, warehouse_id: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
              >
                <option value="">Select warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="rounded-xl bg-[#4F6BF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition hover:bg-[#435CE6]"
              >
                {editingId ? "Update" : "Create"} Item
              </button>
            </div>
          </form>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, SKU, or warehouse"
          className="w-full max-w-sm rounded-full border border-slate-200/80 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
        />
        <label className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-2xs cursor-pointer hover:bg-slate-50">
          <input
            type="checkbox"
            checked={showLowStockOnly}
            onChange={(event) => setShowLowStockOnly(event.target.checked)}
            className="h-4 w-4 rounded text-[#4F6BF5] accent-[#4F6BF5]"
          />
          Show low stock only
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((item) => {
          const lowStock = Number(item.quantity || 0) <= Number(item.reorder_level || 0);
          return (
            <Card key={item.id} className="overflow-hidden hover:shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-all">
              <div className="aspect-[4/3] bg-[#f4f7fb] flex items-center justify-center border-b border-slate-100">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                    No Image
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">{item.name}</p>
                    <p className="text-xs font-medium text-slate-400">{item.sku}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      lowStock
                        ? "border border-amber-150 bg-amber-50 text-amber-700"
                        : "border border-emerald-150 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {lowStock ? "Low Stock" : item.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-medium text-slate-600">
                  <div className="rounded-xl bg-[#f8fafc] p-2.5">
                    <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Quantity</p>
                    <p className="mt-0.5 font-bold text-slate-900 text-sm">{item.quantity}</p>
                  </div>
                  <div className="rounded-xl bg-[#f8fafc] p-2.5">
                    <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Reorder Level</p>
                    <p className="mt-0.5 font-bold text-slate-900 text-sm">{item.reorder_level}</p>
                  </div>
                  <div className="rounded-xl bg-[#f8fafc] p-2.5">
                    <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Warehouse</p>
                    <p className="mt-0.5 font-bold text-slate-900 text-sm truncate">{item.warehouse_name || "-"}</p>
                  </div>
                  <div className="rounded-xl bg-[#f8fafc] p-2.5">
                    <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Stock Value</p>
                    <p className="mt-0.5 font-bold text-slate-900 text-sm">
                      ₹{(Number(item.quantity || 0) * Number(item.cost_price || 0)).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(item)}
                    className="flex-1 rounded-xl border border-slate-200/80 bg-white py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  {itemType === "raw" && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api.delete(`/inventory/raw/${item.id}/`);
                          toast.success("Item deleted");
                          if (editingId === item.id) cancelEditing();
                          await load();
                        } catch {
                          toast.error("Unable to delete inventory item");
                        }
                      }}
                      className="rounded-xl border border-rose-150 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 shadow-2xs transition hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {filteredItems.length === 0 && (
          <Card className="p-8 text-center text-sm font-medium text-slate-400 col-span-full">
            No inventory items match the current filters.
          </Card>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{value}</p>
    </Card>
  );
}
