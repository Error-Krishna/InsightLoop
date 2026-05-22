import { useEffect, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

export default function InventoryItemsPage({ itemType, title }) {
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState({ name: "", unit: "pcs", quantity: 0, selling_price: 0, cost_price: 0, reorder_level: 0, warehouse_id: "", image_url: "" });
  const [editingId, setEditingId] = useState(null);

  async function load() {
    const [itemsResponse, warehousesResponse] = await Promise.all([api.get(`/inventory/${itemType}/`), api.get("/inventory/warehouses/")]);
    setItems(itemsResponse.data);
    setWarehouses(warehousesResponse.data);
  }

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
      setForm({ name: "", unit: "pcs", quantity: 0, selling_price: 0, cost_price: 0, reorder_level: 0, warehouse_id: "", image_url: "" });
      setEditingId(null);
      load();
    } catch {
      toast.error("Unable to save inventory item");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["name", "Name"],
            ["unit", "Unit"],
            ["quantity", "Quantity"],
            ["selling_price", "Selling Price"],
            ["cost_price", "Cost Price"],
            ["reorder_level", "Reorder Level"],
            ["image_url", "Image URL"],
          ].map(([key, label]) => (
            <label key={key} className="block text-sm font-medium text-slate-700">
              {label}
              <input
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

      <div className="grid gap-6 xl:grid-cols-3 md:grid-cols-2">
        {items.map((item) => (
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
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "In Stock" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{item.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div>
                  <p className="text-slate-400">Quantity</p>
                  <p className="font-medium text-slate-900">{item.quantity}</p>
                </div>
                <div>
                  <p className="text-slate-400">Warehouse</p>
                  <p className="font-medium text-slate-900">{item.warehouse_name || "-"}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
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
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await api.delete(`/inventory/${itemType}/${item.id}/`);
                    toast.success("Item deleted");
                    load();
                  }}
                  className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
