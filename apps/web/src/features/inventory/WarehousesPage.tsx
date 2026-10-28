import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Warehouse as WarehouseIcon } from "lucide-react";
import Card from "../../components/Card";
import api from "../../lib/api";

interface WarehouseItem {
  id: string;
  name: string;
  location?: string;
}

interface WarehouseSummaryItem {
  warehouse: WarehouseItem;
  items_count: number;
  total_quantity: number;
  stock_value: number;
  by_type?: {
    raw?: { items_count: number; total_quantity: number; stock_value: number };
    semi_finished?: { items_count: number; total_quantity: number; stock_value: number };
    finished?: { items_count: number; total_quantity: number; stock_value: number };
  };
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [summary, setSummary] = useState<WarehouseSummaryItem[]>([]);
  const [form, setForm] = useState({ name: "", location: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { name: "", location: "" };

  async function load() {
    const [warehousesResponse, summaryResponse] = await Promise.all([
      api.get<WarehouseItem[]>("/inventory/warehouses/"),
      api.get<WarehouseSummaryItem[]>("/inventory/meta/warehouse-summary/"),
    ]);
    setWarehouses(warehousesResponse.data);
    setSummary(summaryResponse.data);
  }

  const totalItems = summary.reduce((sum, item) => sum + Number(item.items_count || 0), 0);
  const totalStockValue = summary.reduce((sum, item) => sum + Number(item.stock_value || 0), 0);

  useEffect(() => {
    load().catch(() => toast.error("Failed to load warehouse data"));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editingId) {
        await api.put(`/inventory/warehouses/${editingId}/`, form);
        toast.success("Warehouse updated");
      } else {
        await api.post("/inventory/warehouses/", form);
        toast.success("Warehouse created");
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch {
      toast.error("Unable to save warehouse");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Warehouses" value={warehouses.length} />
        <StatCard label="Tracked Items" value={totalItems} />
        <StatCard label="Stock Value" value={`₹${Number(totalStockValue).toLocaleString("en-IN")}`} />
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-[#4F6BF5]">
            <WarehouseIcon className="h-4 w-4" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Warehouses</h2>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap gap-4">
          {(["name", "location"] as const).map((field) => (
            <label key={field} className="block min-w-[240px] flex-1 text-xs font-semibold uppercase tracking-wider text-slate-700">
              {field === "name" ? "Warehouse Name" : "Location"}
              <input
                value={form[field]}
                onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
              />
            </label>
          ))}
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-xl bg-[#4F6BF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition hover:bg-[#435CE6]"
            >
              {editingId ? "Update" : "Create"} Warehouse
            </button>
          </div>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {summary.map((item) => (
          <Card key={item.warehouse.id} className="p-6 hover:shadow-[0_6px_20px_rgba(15,23,42,0.06)] transition-all">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-slate-900">{item.warehouse.name}</h3>
                <p className="text-xs font-medium text-slate-400 mt-0.5">{item.warehouse.location}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.warehouse.id);
                    setForm({ name: item.warehouse.name, location: item.warehouse.location || "" });
                  }}
                  className="rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.delete(`/inventory/warehouses/${item.warehouse.id}/`);
                      toast.success("Warehouse deleted");
                      if (editingId === item.warehouse.id) {
                        setEditingId(null);
                        setForm(emptyForm);
                      }
                      await load();
                    } catch {
                      toast.error("Unable to delete warehouse");
                    }
                  }}
                  className="rounded-xl border border-rose-150 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-2xs transition hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <Stat label="Items" value={item.items_count} />
              <Stat label="Quantity" value={item.total_quantity} />
              <Stat label="Stock Value" value={`₹${Number(item.stock_value || 0).toLocaleString()}`} />
            </div>
            {item.by_type && (
              <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-slate-100 pt-4 text-xs">
                <TypeBreakdown label="Raw Material" data={item.by_type.raw} />
                <TypeBreakdown label="Work in Progress" data={item.by_type.semi_finished} />
                <TypeBreakdown label="Ready to Ship" data={item.by_type.finished} />
              </div>
            )}
          </Card>
        ))}
        {summary.length === 0 && (
          <Card className="p-8 text-center text-sm font-medium text-slate-400 col-span-full">
            Create a warehouse to start organizing inventory by location.
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{value}</p>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-[#f4f7fb] p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

function TypeBreakdown({ label, data }: { label: string; data?: { items_count: number; total_quantity: number; stock_value: number } }) {
  const count = data?.items_count || 0;
  return (
    <div className="rounded-xl border border-slate-100 bg-[#f8fafc] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      {count === 0 ? (
        <p className="mt-1 text-xs font-medium text-slate-400">None here</p>
      ) : (
        <>
          <p className="mt-1 font-bold text-slate-900">{data?.total_quantity} units</p>
          <p className="text-xs font-medium text-slate-500">₹{Number(data?.stock_value || 0).toLocaleString("en-IN")}</p>
        </>
      )}
    </div>
  );
}
