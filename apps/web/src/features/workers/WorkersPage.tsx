import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";
import type { Bill, InventoryItemRef } from "../bills/types";

const tabs = ["Workers List", "Material Distribution", "Pay Records"] as const;
type TabType = typeof tabs[number];

export interface WorkerItem {
  id: string;
  name: string;
  age?: number | string;
  address?: string;
  phone?: string;
  joining_date?: string;
  is_active?: boolean;
  material_assigned?: number;
  material_delivered?: number;
  total_wasted?: number;
  wastage_rate?: number;
  pending_amount?: number;
  created_at?: string;
}

export interface MaterialBatch {
  quantity: number;
  date?: string | null;
  notes?: string;
}

export interface MaterialAssignmentItem {
  id: string;
  worker_id?: string | null;
  bill_id?: string | null;
  material_name: string;
  quantity: number;
  price_per_unit: number;
  assignment_date?: string | null;
  notes?: string;
  batches?: MaterialBatch[];
  delivered_quantity: number;
  balance_quantity: number;
  total_value: number;
  status: string;
  completed_at?: string | null;
  wastage_quantity?: number | null;
  over_returned?: boolean;
  raw_item_id?: string;
  raw_item_name?: string;
  raw_unit?: string;
  raw_per_unit?: number;
  raw_issued_quantity?: number;
  raw_returned_quantity?: number;
  produced_quantity?: number;
}

export interface PayRecordItem {
  id: string;
  worker_id?: string | null;
  worker_name?: string;
  product_name: string;
  units_produced: number;
  rate_per_unit: number;
  amount_paid: number;
  total_amount?: number;
  date?: string | null;
  paid: boolean;
}

const emptyWorkerForm = { name: "", age: "", address: "", phone: "", joining_date: "", is_active: true };
const emptyPaymentForm = { product_name: "", units_produced: "", rate_per_unit: "", amount_paid: "", date: "" };

export default function WorkersPage() {
  const [activeTab, setActiveTab] = useState<TabType>(tabs[0]);
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [materials, setMaterials] = useState<MaterialAssignmentItem[]>([]);
  const [payments, setPayments] = useState<PayRecordItem[]>([]);
  const [search, setSearch] = useState("");
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [workerForm, setWorkerForm] = useState(emptyWorkerForm);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);

  const filteredWorkers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return workers;
    return workers.filter((worker) =>
      [worker.name, worker.phone, worker.address].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [workers, search]);

  const selectedWorker = useMemo(() => workers.find((worker) => worker.id === selectedWorkerId), [workers, selectedWorkerId]);
  const totalPending = useMemo(() => workers.reduce((sum, worker) => sum + Number(worker.pending_amount || 0), 0), [workers]);
  const activeWorkers = useMemo(() => workers.filter((worker) => worker.is_active).length, [workers]);
  const totalAssigned = useMemo(() => workers.reduce((sum, worker) => sum + Number(worker.material_assigned || 0), 0), [workers]);
  const totalWasted = useMemo(() => workers.reduce((sum, worker) => sum + Number(worker.total_wasted || 0), 0), [workers]);

  async function loadWorkers() {
    const { data } = await api.get<WorkerItem[]>("/workers/");
    setWorkers(data);
    if (!selectedWorkerId && data[0]) {
      setSelectedWorkerId(data[0].id);
    }
    if (selectedWorkerId && !data.some((worker) => worker.id === selectedWorkerId)) {
      setSelectedWorkerId(data[0]?.id || "");
    }
  }

  async function loadWorkerDetails(workerId: string) {
    if (!workerId) {
      setMaterials([]);
      setPayments([]);
      return;
    }
    const [materialsResponse, paymentsResponse] = await Promise.all([
      api.get<MaterialAssignmentItem[]>(`/workers/${workerId}/materials/`),
      api.get<PayRecordItem[]>(`/workers/${workerId}/payments/`),
    ]);
    setMaterials(materialsResponse.data);
    setPayments(paymentsResponse.data);
  }

  function startEditing(worker: WorkerItem) {
    setEditingWorkerId(worker.id);
    setWorkerForm({
      name: worker.name || "",
      age: String(worker.age || ""),
      address: worker.address || "",
      phone: worker.phone || "",
      joining_date: worker.joining_date ? worker.joining_date.slice(0, 10) : "",
      is_active: Boolean(worker.is_active),
    });
  }

  function resetWorkerForm() {
    setEditingWorkerId(null);
    setWorkerForm(emptyWorkerForm);
  }

  useEffect(() => {
    void loadWorkers().catch(() => toast.error("Failed to load workers"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reason: initial worker list load on component mount
  }, []);

  useEffect(() => {
    void loadWorkerDetails(selectedWorkerId).catch(() => toast.error("Failed to load worker details"));
  }, [selectedWorkerId]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total Workers" value={workers.length} />
        <MetricCard label="Active Workers" value={activeWorkers} />
        <MetricCard label="Pending Payments" value={`₹${Number(totalPending).toLocaleString("en-IN")}`} />
        <MetricCard label="Total Material Wasted" value={totalWasted.toLocaleString("en-IN")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200/60 bg-slate-100/80 p-1 shadow-2xs">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === tab
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search workers"
          className="w-full max-w-xs rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
        />
      </div>

      {activeTab === "Workers List" && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{editingWorkerId ? "Edit Worker" : "Add Worker"}</h2>
              {editingWorkerId && (
                <button
                  type="button"
                  onClick={resetWorkerForm}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  if (editingWorkerId) {
                    await api.put(`/workers/${editingWorkerId}/`, workerForm);
                    toast.success("Worker updated");
                  } else {
                    await api.post("/workers/", workerForm);
                    toast.success("Worker created");
                  }
                  resetWorkerForm();
                  await loadWorkers();
                } catch (error: unknown) {
                  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                  toast.error(detail ?? "Failed to save worker");
                }
              }}
              className="mt-6 grid gap-4 md:grid-cols-2"
            >
              <Field label="Name" value={workerForm.name} onChange={(value) => setWorkerForm((current) => ({ ...current, name: value }))} />
              <Field label="Age" type="number" value={workerForm.age} onChange={(value) => setWorkerForm((current) => ({ ...current, age: value }))} />
              <Field label="Address" value={workerForm.address} onChange={(value) => setWorkerForm((current) => ({ ...current, address: value }))} />
              <Field label="Phone" value={workerForm.phone} onChange={(value) => setWorkerForm((current) => ({ ...current, phone: value }))} />
              <Field label="Joining Date" type="date" value={workerForm.joining_date} onChange={(value) => setWorkerForm((current) => ({ ...current, joining_date: value }))} />
              <label className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-2xs cursor-pointer">
                Active worker
                <input
                  type="checkbox"
                  checked={Boolean(workerForm.is_active)}
                  onChange={(event) => setWorkerForm((current) => ({ ...current, is_active: event.target.checked }))}
                  className="h-4 w-4 rounded text-[#4F6BF5] accent-[#4F6BF5]"
                />
              </label>
              <button
                type="submit"
                className="rounded-xl bg-[#4F6BF5] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition hover:bg-[#435CE6] md:col-span-2"
              >
                {editingWorkerId ? "Update Worker" : "Save Worker"}
              </button>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-bold tracking-tight text-slate-900">Workers</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">Assigned material: {totalAssigned.toLocaleString("en-IN")} units</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {["Worker", "Status", "Assigned", "Delivered", "Wastage", "Pending", ""].map((heading) => (
                      <th key={heading} className="px-6 py-3.5 text-left">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70">
                  {filteredWorkers.map((worker) => (
                    <tr key={worker.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{worker.name}</p>
                        <p className="text-xs font-medium text-slate-400">{worker.phone || "No phone"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${worker.is_active ? "border border-emerald-150 bg-emerald-50 text-emerald-700" : "border border-slate-200 bg-slate-100 text-slate-600"}`}>
                          {worker.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800">{worker.material_assigned}</td>
                      <td className="px-6 py-4 font-semibold text-emerald-600">{worker.material_delivered}</td>
                      <td className="px-6 py-4">
                        {Number(worker.total_wasted || 0) > 0 ? (
                          <span className="font-bold text-amber-600">
                            {worker.total_wasted} <span className="text-xs font-medium text-amber-500">({worker.wastage_rate}%)</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">₹{Number(worker.pending_amount || 0).toLocaleString("en-IN")}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(worker)}
                            className="rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.delete(`/workers/${worker.id}/`);
                                toast.success("Worker deleted");
                                if (selectedWorkerId === worker.id) {
                                  setSelectedWorkerId("");
                                  setMaterials([]);
                                  setPayments([]);
                                }
                                if (editingWorkerId === worker.id) {
                                  resetWorkerForm();
                                }
                                await loadWorkers();
                              } catch (error: unknown) {
                                const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                                toast.error(detail ?? "Failed to delete worker");
                              }
                            }}
                            className="rounded-xl border border-rose-150 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-2xs transition hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredWorkers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-sm font-medium text-slate-400">
                        No workers match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab !== "Workers List" && (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <Card className="p-4">
            <h2 className="text-base font-bold tracking-tight text-slate-900">Select Worker</h2>
            <div className="mt-4 space-y-2 max-h-[600px] overflow-y-auto">
              {filteredWorkers.map((worker) => (
                <button
                  type="button"
                  key={worker.id}
                  onClick={() => setSelectedWorkerId(worker.id)}
                  className={`w-full rounded-2xl border p-3.5 text-left text-sm transition-all cursor-pointer ${
                    selectedWorkerId === worker.id
                      ? "border-[#4F6BF5] bg-indigo-50/70 text-[#4F6BF5] shadow-xs ring-1 ring-[#4F6BF5]/30"
                      : "border-slate-200/70 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-bold text-slate-900">{worker.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    Pending ₹{Number(worker.pending_amount || 0).toLocaleString("en-IN")}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {activeTab === "Material Distribution" ? (
            <MaterialDistributionPanel
              selectedWorker={selectedWorker}
              selectedWorkerId={selectedWorkerId}
              materials={materials}
              loadWorkerDetails={loadWorkerDetails}
              loadWorkers={loadWorkers}
            />
          ) : (
            <Card className="p-6">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Pay Records</h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await api.post(`/workers/${selectedWorkerId}/payments/`, paymentForm);
                    toast.success("Payment record created");
                    setPaymentForm(emptyPaymentForm);
                    await loadWorkerDetails(selectedWorkerId);
                    await loadWorkers();
                  } catch (error: unknown) {
                    const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                    toast.error(detail ?? "Failed to save payment record");
                  }
                }}
                className="mt-6 grid gap-4 md:grid-cols-2"
              >
                <Field label="Product" value={paymentForm.product_name} onChange={(value) => setPaymentForm((current) => ({ ...current, product_name: value }))} />
                <Field label="Units" type="number" value={paymentForm.units_produced} onChange={(value) => setPaymentForm((current) => ({ ...current, units_produced: value }))} />
                <Field label="Rate / Unit" type="number" value={paymentForm.rate_per_unit} onChange={(value) => setPaymentForm((current) => ({ ...current, rate_per_unit: value }))} />
                <Field label="Amount Paid" type="number" value={paymentForm.amount_paid} onChange={(value) => setPaymentForm((current) => ({ ...current, amount_paid: value }))} />
                <Field label="Date" type="date" value={paymentForm.date} onChange={(value) => setPaymentForm((current) => ({ ...current, date: value }))} />
                <button
                  type="submit"
                  disabled={!selectedWorker}
                  className="rounded-xl bg-[#4F6BF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition hover:bg-[#435CE6] disabled:opacity-50"
                >
                  Save Payment
                </button>
              </form>
              <div className="mt-8 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {["Worker", "Product", "Units", "Rate", "Amount", "Paid So Far", "Balance", "Status", ""].map((heading) => (
                        <th key={heading} className="px-4 py-3.5 text-left">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70">
                    {payments.map((payment) => (
                      <PayRecordRow
                        key={payment.id}
                        payment={payment}
                        onChanged={async () => {
                          await loadWorkerDetails(selectedWorkerId);
                          await loadWorkers();
                        }}
                      />
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm font-medium text-slate-400">
                          No pay records yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}

function Field({ label, value, onChange, type = "text" }: FieldProps) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
      />
    </label>
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

interface MaterialDistributionPanelProps {
  selectedWorker?: WorkerItem;
  selectedWorkerId: string;
  materials: MaterialAssignmentItem[];
  loadWorkerDetails: (id: string) => Promise<void>;
  loadWorkers: () => Promise<void>;
}

function MaterialDistributionPanel({
  selectedWorker,
  selectedWorkerId,
  materials,
  loadWorkerDetails,
  loadWorkers,
}: MaterialDistributionPanelProps) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [rawItems, setRawItems] = useState<InventoryItemRef[]>([]);
  const [selectedBillId, setSelectedBillId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedRawItemId, setSelectedRawItemId] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [rawPerUnit, setRawPerUnit] = useState("1");
  const [issueQuantity, setIssueQuantity] = useState("");
  const [wageAmount, setWageAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadDependencies() {
      try {
        const [billsRes, rawRes] = await Promise.all([
          api.get<Bill[]>("/bills/"),
          api.get<InventoryItemRef[]>("/inventory/raw/"),
        ]);
        setBills(billsRes.data);
        setRawItems(rawRes.data);
      } catch {
        // non-blocking
      }
    }
    void loadDependencies();
  }, []);

  const selectedBill = bills.find((b) => b.id === selectedBillId);
  const billProducts = selectedBill?.products || [];

  async function refresh() {
    await loadWorkerDetails(selectedWorkerId);
    await loadWorkers();
  }

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBillId) {
      toast.error("Please select a confirmed order / bill");
      return;
    }
    if (!selectedProduct) {
      toast.error("Please select an ordered product");
      return;
    }
    if (!selectedRawItemId) {
      toast.error("Please select a raw material");
      return;
    }
    const qty = Number(targetQuantity);
    if (!qty || qty <= 0) {
      toast.error("Please enter a valid target quantity");
      return;
    }

    setSaving(true);
    try {
      await api.post(`/workers/${selectedWorkerId}/materials/`, {
        bill_id: selectedBillId,
        material_name: selectedProduct,
        raw_item_id: selectedRawItemId,
        quantity: qty,
        raw_per_unit: Number(rawPerUnit) || 1,
        issue_quantity: issueQuantity === "" ? undefined : Number(issueQuantity),
        wage_amount: Number(wageAmount) || 0,
        date: date || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Material assigned to worker");
      setSelectedBillId("");
      setSelectedProduct("");
      setSelectedRawItemId("");
      setTargetQuantity("");
      setRawPerUnit("1");
      setIssueQuantity("");
      setWageAmount("");
      setNotes("");
      await refresh();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to assign material");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold tracking-tight text-slate-900">Material Assignment</h2>
      <p className="mt-1 text-xs font-medium text-slate-400">
        Assign production work for confirmed orders. Raw material is deducted from stock and tracked with the worker until products are returned.
      </p>

      <form onSubmit={handleAssign} className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Select Order / Bill *
            <select
              value={selectedBillId}
              onChange={(e) => {
                setSelectedBillId(e.target.value);
                setSelectedProduct("");
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
            >
              <option value="">Select bill…</option>
              {bills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.invoice_number} · {b.buyer?.name || "Customer"} (₹{Number(b.grand_total).toLocaleString("en-IN")})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Product Line *
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              disabled={!selectedBillId}
              className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Select product to produce…</option>
              {billProducts.map((p, idx) => (
                <option key={idx} value={p.name}>
                  {p.name} ({p.quantity} {p.unit})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Raw Material to Issue *
            <select
              value={selectedRawItemId}
              onChange={(e) => setSelectedRawItemId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
            >
              <option value="">Select raw item…</option>
              {rawItems.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.quantity} {r.unit} available)
                </option>
              ))}
            </select>
          </label>
        </div>

        <Field
          label="Target Output Quantity *"
          type="number"
          value={targetQuantity}
          onChange={setTargetQuantity}
        />

        <Field
          label="Raw per Output Unit"
          type="number"
          value={rawPerUnit}
          onChange={setRawPerUnit}
        />

        <Field
          label="Initial Raw Quantity to Issue (leave blank for all)"
          type="number"
          value={issueQuantity}
          onChange={setIssueQuantity}
        />

        <Field
          label="Worker Flat Wage (₹)"
          type="number"
          value={wageAmount}
          onChange={setWageAmount}
        />

        <Field label="Assignment Date" type="date" value={date} onChange={setDate} />
        <Field label="Notes (optional)" value={notes} onChange={setNotes} />

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={!selectedWorker || saving}
            className="w-full rounded-xl bg-[#4F6BF5] px-5 py-3 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition hover:bg-[#435CE6] disabled:opacity-50"
          >
            {saving ? "Assigning…" : "Assign Material & Issue Raw"}
          </button>
        </div>
      </form>

      <div className="mt-8 space-y-4">
        {materials.map((item) => (
          <AssignmentCard key={item.id} item={item} onChanged={refresh} />
        ))}
        {materials.length === 0 && <p className="text-sm font-medium text-slate-400 py-4 text-center">No material assignments yet.</p>}
      </div>
    </Card>
  );
}

function AssignmentCard({ item, onChanged }: { item: MaterialAssignmentItem; onChanged: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [returnedRawInput, setReturnedRawInput] = useState("0");
  const [showIssueRaw, setShowIssueRaw] = useState(false);

  const isCompleted = item.status === "completed";
  const isCancelled = item.status === "cancelled";
  const isOpen = item.status === "open";
  const batches = item.batches || [];
  const producedQty = Number(item.produced_quantity ?? item.delivered_quantity ?? 0);
  const canCancel = isOpen && producedQty === 0;

  async function handleCancel() {
    try {
      await api.put(`/workers/materials/${item.id}/cancel/`);
      toast.success("Assignment cancelled; raw material returned to inventory");
      await onChanged();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to cancel assignment");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition-all hover:border-slate-300">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => setExpanded((c) => !c)} className="flex-1 text-left cursor-pointer">
          <div className="flex items-center gap-2">
            <p className="font-bold text-slate-900">{item.material_name}</p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isCompleted
                  ? "border border-emerald-150 bg-emerald-50 text-emerald-700"
                  : isCancelled
                  ? "border border-slate-200 bg-slate-100 text-slate-500"
                  : "border border-indigo-150 bg-indigo-50 text-[#4F6BF5]"
              }`}
            >
              {isCompleted ? "Completed" : isCancelled ? "Cancelled" : "Open"}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-400 mt-0.5">
            {item.raw_item_name ? `Raw: ${item.raw_item_name} · ` : ""}
            Assigned: {item.assignment_date?.slice(0, 10)}
          </p>
        </button>
        <div className="text-right text-sm">
          <p className="font-bold text-slate-900">
            Produced: {producedQty} / {item.quantity} units
          </p>
          <p className="text-xs font-medium text-slate-400">
            Raw Issued: {item.raw_issued_quantity ?? item.quantity} · Returned: {item.raw_returned_quantity ?? 0}
          </p>
        </div>
      </div>

      {isCompleted && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 border border-amber-100">
          <span>
            Wastage: {item.wastage_quantity ?? 0} raw units
          </span>
          {item.over_returned && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-600 font-semibold">More returned than assigned</span>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {batches.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700">Output Batches Handed In:</p>
              {batches.map((batch, index) => (
                <div key={index} className="flex items-center justify-between rounded-xl bg-[#f4f7fb] px-3.5 py-2 text-xs">
                  <span className="font-semibold text-slate-700">Chunk {index + 1}: {batch.quantity} finished units</span>
                  <span className="text-xs font-medium text-slate-400">
                    {batch.date ? String(batch.date).slice(0, 10) : ""}
                    {batch.notes ? ` · ${batch.notes}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isOpen && (
            <div className="space-y-3">
              <AddBatchForm assignmentId={item.id} onAdded={onChanged} />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowIssueRaw((c) => !c)}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-[#4F6BF5] transition hover:bg-indigo-100/60"
                >
                  {showIssueRaw ? "Cancel Issue" : "+ Issue More Raw"}
                </button>

                {canCancel && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-xl border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    Cancel Assignment
                  </button>
                )}
              </div>

              {showIssueRaw && (
                <IssueRawForm
                  assignmentId={item.id}
                  onIssued={async () => {
                    setShowIssueRaw(false);
                    await onChanged();
                  }}
                />
              )}

              <div>
                {!confirmingComplete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingComplete(true)}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100/60"
                  >
                    Mark Job Complete
                  </button>
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs">
                    <p className="font-medium text-emerald-950">
                      Produced {producedQty} of {item.quantity} target units. Enter any unused raw material returned by the worker to restore it to inventory:
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <input
                        type="number"
                        value={returnedRawInput}
                        onChange={(e) => setReturnedRawInput(e.target.value)}
                        placeholder="Raw returned"
                        className="w-28 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.put(`/workers/materials/${item.id}/complete/`, {
                              raw_returned_quantity: Number(returnedRawInput) || 0,
                            });
                            toast.success("Assignment marked complete");
                            setConfirmingComplete(false);
                            await onChanged();
                          } catch (error: unknown) {
                            const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                            toast.error(detail ?? "Failed to mark complete");
                          }
                        }}
                        className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500"
                      >
                        Confirm Complete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingComplete(false)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddBatchForm({ assignmentId, onAdded }: { assignmentId: string; onAdded: () => Promise<void> }) {
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAddBatch(event: React.FormEvent) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter valid quantity produced");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/workers/materials/${assignmentId}/batches/`, {
        quantity: qty,
        date: date || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`Logged ${qty} produced`);
      setQuantity("");
      setNotes("");
      await onAdded();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to record produced chunk");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleAddBatch} className="flex flex-wrap items-end gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5">
      <div className="w-32">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <span>Batch Output</span>
          <input
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="e.g. 10"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs outline-none focus:border-emerald-500"
          />
        </label>
      </div>
      <div className="w-36">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs outline-none focus:border-emerald-500"
          />
        </label>
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <span>Notes (optional)</span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="e.g. first batch"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs outline-none focus:border-emerald-500"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {saving ? "Logging…" : "Log return"}
      </button>
    </form>
  );
}

function IssueRawForm({ assignmentId, onIssued }: { assignmentId: string; onIssued: () => Promise<void> }) {
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleIssue(event: React.FormEvent) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter raw quantity to issue");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/workers/materials/${assignmentId}/issues/`, {
        quantity: qty,
        date: date || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`Issued ${qty} raw material to worker`);
      setQuantity("");
      setNotes("");
      await onIssued();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to issue raw material");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleIssue} className="flex flex-wrap items-end gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5">
      <div className="w-32">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <span>More Raw Qty</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 50"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs outline-none focus:border-[#4F6BF5]"
          />
        </label>
      </div>
      <div className="w-36">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs outline-none focus:border-[#4F6BF5]"
          />
        </label>
      </div>
      <div className="min-w-[140px] flex-1">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          <span>Notes (optional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. extra thread"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-2xs outline-none focus:border-[#4F6BF5]"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-[#4F6BF5] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#435CE6] disabled:opacity-50"
      >
        {saving ? "Issuing…" : "Issue Raw"}
      </button>
    </form>
  );
}

function PayRecordRow({ payment, onChanged }: { payment: PayRecordItem; onChanged: () => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const totalOwed = Number(payment.units_produced || 0) * Number(payment.rate_per_unit || 0);
  const paidSoFar = Number(payment.amount_paid || 0);
  const balance = Math.max(totalOwed - paidSoFar, 0);
  const isFullyPaid = payment.paid || paidSoFar >= totalOwed;

  async function handleRecordPartial(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter how much was paid");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/workers/payments/${payment.id}/record-payment/`, { amount: value });
      toast.success(`₹${value.toLocaleString("en-IN")} recorded`);
      setAmount("");
      await onChanged();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid() {
    try {
      await api.put(`/workers/payments/${payment.id}/mark-paid/`);
      toast.success("Payment marked as paid");
      await onChanged();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to update payment");
    }
  }

  return (
    <tr className="transition-colors hover:bg-slate-50/70">
      <td className="px-4 py-3.5 font-bold text-slate-900">{payment.worker_name}</td>
      <td className="px-4 py-3.5 font-medium text-slate-700">{payment.product_name}</td>
      <td className="px-4 py-3.5 font-medium text-slate-700">{payment.units_produced}</td>
      <td className="px-4 py-3.5 text-slate-600 font-medium">₹{payment.rate_per_unit}</td>
      <td className="px-4 py-3.5 font-bold text-slate-900">₹{totalOwed.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3.5 font-bold text-emerald-600">₹{paidSoFar.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3.5 font-bold text-amber-600">₹{balance.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3.5">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isFullyPaid
              ? "border border-emerald-150 bg-emerald-50 text-emerald-700"
              : paidSoFar > 0
              ? "border border-amber-150 bg-amber-50 text-amber-700"
              : "border border-slate-200 bg-slate-100 text-slate-600"
          }`}
        >
          {isFullyPaid ? "Paid" : paidSoFar > 0 ? "Partial" : "Pending"}
        </span>
      </td>
      <td className="px-4 py-3.5">
        {!isFullyPaid && (
          <form onSubmit={handleRecordPartial} className="flex items-center gap-1.5">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`≤ ${balance}`}
              className="w-20 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs shadow-2xs outline-none focus:border-[#4F6BF5]"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50"
            >
              Pay
            </button>
            <button
              type="button"
              onClick={handleMarkPaid}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-2xs transition hover:bg-emerald-100/60"
            >
              Mark Paid
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
