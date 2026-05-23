import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

const emptyForm = { name: "", unit: "pcs", quantity: 0, selling_price: 0, cost_price: 0, reorder_level: 0, warehouse_id: "", image_url: "" };

export default function InventoryItemsPage({ itemType, title }) {
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  async function load() {
    const [itemsResponse, warehousesResponse] = await Promise.all([api.get(`/inventory/${itemType}/`), api.get("/inventory/warehouses/")]);
    setItems(itemsResponse.data);
    setWarehouses(warehousesResponse.data);
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !query || [item.name, item.sku, item.warehouse_name].some((value) => String(value || "").toLowerCase().includes(query));
      const isLowStock = Number(item.quantity || 0) <= Number(item.reorder_level || 0);
      return matchesQuery && (!showLowStockOnly || isLowStock);
    });
  }, [items, search, showLowStockOnly]);

  const inventoryStats = useMemo(() => {
    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const stockValue = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.cost_price || 0), 0);
    const lowStockCount = items.filter((item) => Number(item.quantity || 0) <= Number(item.reorder_level || 0)).length;
    return { totalQuantity, stockValue, lowStockCount };
  }, [items]);

  useEffect(() => {
    load().catch(() => toast.error(`Failed to load ${title.toLowerCase()}`));
  }, [itemType, title]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      if (editingId) {
        await api.put(`/inventory/${itemType}/${editingId}/`, form);
        toast.success("Inventory item updated");
      } else {
        await api.post(`/inventory/${itemType}/`, form);
        toast.success("Inventory item created");
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch {
      toast.error("Unable to save inventory item");
    }
  }

  function startEditing(item) {
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Items" value={items.length} />
        <MetricCard label="Total Quantity" value={inventoryStats.totalQuantity.toLocaleString("en-IN")} />
        <MetricCard label="Stock Value" value={`₹${inventoryStats.stockValue.toLocaleString("en-IN")}`} />
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">Low stock items: {inventoryStats.lowStockCount}</p>
          </div>
          {editingId && (
            <button type="button" onClick={cancelEditing} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              Cancel Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["name", "Name", "text"],
            ["unit", "Unit", "text"],
            ["quantity", "Quantity", "number"],
            ["selling_price", "Selling Price", "number"],
            ["cost_price", "Cost Price", "number"],
            ["reorder_level", "Reorder Level", "number"],
            ["image_url", "Image URL", "text"],
          ].map(([key, label, type]) => (
            <label key={key} className="block text-sm font-medium text-slate-700">
              {label}
              <input
                type={type}
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3"
              />
            </label>
          ))}
          <label className="block text-sm font-medium text-slate-700">
            Warehouse
            <select value={form.warehouse_id} onChange={(event) => setForm((current) => ({ ...current, warehouse_id: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3">
              <option value="">Select warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
              {editingId ? "Update" : "Create"} Item
            </button>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, SKU, or warehouse"
          className="w-full max-w-sm rounded-lg border border-slate-200 px-4 py-2.5 text-sm"
        />
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <input type="checkbox" checked={showLowStockOnly} onChange={(event) => setShowLowStockOnly(event.target.checked)} className="h-4 w-4 accent-blue-600" />
          Show low stock only
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((item) => {
          const lowStock = Number(item.quantity || 0) <= Number(item.reorder_level || 0);
          return (
            <Card key={item.id} className="overflow-hidden">
              <div className="aspect-[4/3] bg-slate-100">
                {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400">No Image</div>}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{item.name}</p>
                    <p className="text-sm text-slate-500">{item.sku}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${lowStock ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                    {lowStock ? "Low Stock" : item.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div>
                    <p className="text-slate-400">Quantity</p>
                    <p className="font-medium text-slate-900">{item.quantity}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Reorder Level</p>
                    <p className="font-medium text-slate-900">{item.reorder_level}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Warehouse</p>
                    <p className="font-medium text-slate-900">{item.warehouse_name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Stock Value</p>
                    <p className="font-medium text-slate-900">₹{(Number(item.quantity || 0) * Number(item.cost_price || 0)).toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={() => startEditing(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await api.delete(`/inventory/${itemType}/${item.id}/`);
                        toast.success("Item deleted");
                        if (editingId === item.id) cancelEditing();
                        await load();
                      } catch {
                        toast.error("Unable to delete inventory item");
                      }
                    }}
                    className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
        {filteredItems.length === 0 && (
          <Card className="p-6 text-sm text-slate-400">
            No inventory items match the current filters.
          </Card>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </Card>
  );
}
