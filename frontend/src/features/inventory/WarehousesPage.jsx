import { useEffect, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [summary, setSummary] = useState([]);
  const [form, setForm] = useState({ name: "", location: "" });
  const [editingId, setEditingId] = useState(null);

  async function load() {
    const [warehousesResponse, summaryResponse] = await Promise.all([api.get("/inventory/warehouses/"), api.get("/inventory/meta/warehouse-summary/")]); 
    setWarehouses(warehousesResponse.data);
    setSummary(summaryResponse.data);
  }

  useEffect(() => {
    load().catch(() => toast.error("Failed to load warehouse data"));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (editingId) {
      await api.put(`/inventory/warehouses/${editingId}/`, form);
      toast.success("Warehouse updated");
    } else {
      await api.post("/inventory/warehouses/", form);
      toast.success("Warehouse created");
    }
    setForm({ name: "", location: "" });
    setEditingId(null);
    load();
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-slate-900">Warehouses</h2>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap gap-4">
          {["name", "location"].map((field) => (
            <label key={field} className="block min-w-[240px] flex-1 text-sm font-medium text-slate-700">
              {field === "name" ? "Warehouse Name" : "Location"}
              <input value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3" />
            </label>
          ))}
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
            {editingId ? "Update" : "Create"} Warehouse
          </button>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {summary.map((item) => (
          <Card key={item.warehouse.id} className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{item.warehouse.name}</h3>
                <p className="text-sm text-slate-500">{item.warehouse.location}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.warehouse.id);
                    setForm({ name: item.warehouse.name, location: item.warehouse.location });
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await api.delete(`/inventory/warehouses/${item.warehouse.id}/`);
                    toast.success("Warehouse deleted");
                    load();
                  }}
                  className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4 text-sm">
              <Stat label="Items" value={item.items_count} />
              <Stat label="Quantity" value={item.total_quantity} />
              <Stat label="Stock Value" value={`₹${Number(item.stock_value || 0).toLocaleString()}`} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
