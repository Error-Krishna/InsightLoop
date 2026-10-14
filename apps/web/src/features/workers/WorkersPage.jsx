import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

const tabs = ["Workers List", "Material Distribution", "Pay Records"];
const emptyWorkerForm = { name: "", age: "", address: "", phone: "", joining_date: "", is_active: true };
const emptyMaterialForm = { material_name: "", quantity: "", price_per_unit: "", date: "", notes: "" };
const emptyPaymentForm = { product_name: "", units_produced: "", rate_per_unit: "", amount_paid: "", date: "" };

export default function WorkersPage() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState("");
  const [editingWorkerId, setEditingWorkerId] = useState(null);
  const [workerForm, setWorkerForm] = useState(emptyWorkerForm);
  const [materialForm, setMaterialForm] = useState(emptyMaterialForm);
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
    const { data } = await api.get("/workers/");
    setWorkers(data);
    if (!selectedWorkerId && data[0]) {
      setSelectedWorkerId(data[0].id);
    }
    if (selectedWorkerId && !data.some((worker) => worker.id === selectedWorkerId)) {
      setSelectedWorkerId(data[0]?.id || "");
    }
  }

  async function loadWorkerDetails(workerId) {
    if (!workerId) {
      setMaterials([]);
      setPayments([]);
      return;
    }
    const [materialsResponse, paymentsResponse] = await Promise.all([api.get(`/workers/${workerId}/materials/`), api.get(`/workers/${workerId}/payments/`)]);
    setMaterials(materialsResponse.data);
    setPayments(paymentsResponse.data);
  }

  function startEditing(worker) {
    setEditingWorkerId(worker.id);
    setWorkerForm({
      name: worker.name || "",
      age: worker.age || "",
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
    loadWorkers().catch(() => toast.error("Failed to load workers"));
  }, []);

  useEffect(() => {
    loadWorkerDetails(selectedWorkerId).catch(() => toast.error("Failed to load worker details"));
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
        <div className="flex flex-wrap gap-3">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === tab ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search workers"
          className="w-full max-w-xs rounded-lg border border-slate-200 px-4 py-2.5 text-sm"
        />
      </div>

      {activeTab === "Workers List" && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-900">{editingWorkerId ? "Edit Worker" : "Add Worker"}</h2>
              {editingWorkerId && (
                <button type="button" onClick={resetWorkerForm} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
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
                } catch (error) {
                  toast.error(error.response?.data?.detail || "Failed to save worker");
                }
              }}
              className="mt-6 grid gap-4 md:grid-cols-2"
            >
              <Field label="Name" value={workerForm.name} onChange={(value) => setWorkerForm((current) => ({ ...current, name: value }))} />
              <Field label="Age" type="number" value={workerForm.age} onChange={(value) => setWorkerForm((current) => ({ ...current, age: value }))} />
              <Field label="Address" value={workerForm.address} onChange={(value) => setWorkerForm((current) => ({ ...current, address: value }))} />
              <Field label="Phone" value={workerForm.phone} onChange={(value) => setWorkerForm((current) => ({ ...current, phone: value }))} />
              <Field label="Joining Date" type="date" value={workerForm.joining_date} onChange={(value) => setWorkerForm((current) => ({ ...current, joining_date: value }))} />
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
                Active worker
                <input
                  type="checkbox"
                  checked={Boolean(workerForm.is_active)}
                  onChange={(event) => setWorkerForm((current) => ({ ...current, is_active: event.target.checked }))}
                  className="h-4 w-4 accent-blue-600"
                />
              </label>
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
                {editingWorkerId ? "Update Worker" : "Save Worker"}
              </button>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Workers</h2>
              <p className="mt-1 text-sm text-slate-500">Assigned material: {totalAssigned.toLocaleString("en-IN")} units</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {["Worker", "Status", "Assigned", "Delivered", "Wastage", "Pending", ""].map((heading) => (
                      <th key={heading} className="px-6 py-3 text-left font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkers.map((worker) => (
                    <tr key={worker.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">{worker.name}</p>
                        <p className="text-xs text-slate-500">{worker.phone || "No phone"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${worker.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"}`}>
                          {worker.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4">{worker.material_assigned}</td>
                      <td className="px-6 py-4">{worker.material_delivered}</td>
                      <td className="px-6 py-4">
                        {worker.total_wasted > 0 ? (
                          <span className="font-medium text-amber-600">
                            {worker.total_wasted} <span className="text-xs text-amber-500">({worker.wastage_rate}%)</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">₹{Number(worker.pending_amount || 0).toLocaleString("en-IN")}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEditing(worker)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium">
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
                              } catch (error) {
                                toast.error(error.response?.data?.detail || "Failed to delete worker");
                              }
                            }}
                            className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredWorkers.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-slate-400">
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
            <h2 className="text-lg font-semibold text-slate-900">Select Worker</h2>
            <div className="mt-4 space-y-2">
              {filteredWorkers.map((worker) => (
                <button
                  type="button"
                  key={worker.id}
                  onClick={() => setSelectedWorkerId(worker.id)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${selectedWorkerId === worker.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"}`}
                >
                  <p className="font-medium">{worker.name}</p>
                  <p className="mt-1 text-xs text-slate-500">Pending ₹{Number(worker.pending_amount || 0).toLocaleString("en-IN")}</p>
                </button>
              ))}
            </div>
          </Card>

          {activeTab === "Material Distribution" ? (
            <MaterialDistributionPanel
              selectedWorker={selectedWorker}
              selectedWorkerId={selectedWorkerId}
              materials={materials}
              materialForm={materialForm}
              setMaterialForm={setMaterialForm}
              emptyMaterialForm={emptyMaterialForm}
              loadWorkerDetails={loadWorkerDetails}
              loadWorkers={loadWorkers}
            />
          ) : (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-slate-900">Pay Records</h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await api.post(`/workers/${selectedWorkerId}/payments/`, paymentForm);
                    toast.success("Payment record created");
                    setPaymentForm(emptyPaymentForm);
                    await loadWorkerDetails(selectedWorkerId);
                    await loadWorkers();
                  } catch (error) {
                    toast.error(error.response?.data?.detail || "Failed to save payment record");
                  }
                }}
                className="mt-6 grid gap-4 md:grid-cols-2"
              >
                <Field label="Product" value={paymentForm.product_name} onChange={(value) => setPaymentForm((current) => ({ ...current, product_name: value }))} />
                <Field label="Units" type="number" value={paymentForm.units_produced} onChange={(value) => setPaymentForm((current) => ({ ...current, units_produced: value }))} />
                <Field label="Rate / Unit" type="number" value={paymentForm.rate_per_unit} onChange={(value) => setPaymentForm((current) => ({ ...current, rate_per_unit: value }))} />
                <Field label="Amount Paid" type="number" value={paymentForm.amount_paid} onChange={(value) => setPaymentForm((current) => ({ ...current, amount_paid: value }))} />
                <Field label="Date" type="date" value={paymentForm.date} onChange={(value) => setPaymentForm((current) => ({ ...current, date: value }))} />
                <button type="submit" disabled={!selectedWorker} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  Save Payment
                </button>
              </form>
              <div className="mt-8 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {["Worker", "Product", "Units", "Rate", "Amount", "Paid So Far", "Balance", "Status", ""].map((heading) => (
                        <th key={heading} className="px-4 py-3 text-left font-medium">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
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
                        <td colSpan="9" className="px-4 py-8 text-center text-slate-400">
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

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3"
      />
    </label>
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

function MaterialDistributionPanel({
  selectedWorker,
  selectedWorkerId,
  materials,
  materialForm,
  setMaterialForm,
  emptyMaterialForm,
  loadWorkerDetails,
  loadWorkers,
}) {
  async function refresh() {
    await loadWorkerDetails(selectedWorkerId);
    await loadWorkers();
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold text-slate-900">Material Assignment</h2>
      <p className="mt-1 text-sm text-slate-500">
        Hand out a batch of raw material, then log each partial return as it comes back — e.g. 500 pieces
        handed out, returned over time as 100, 50, 50, 200… Mark it complete once the job is done to see
        how much was actually lost in processing.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api.post(`/workers/${selectedWorkerId}/materials/`, materialForm);
            toast.success("Material assigned");
            setMaterialForm(emptyMaterialForm);
            await refresh();
          } catch (error) {
            toast.error(error.response?.data?.detail || "Failed to assign material");
          }
        }}
        className="mt-6 grid gap-4 md:grid-cols-2"
      >
        <Field label="Material Name" value={materialForm.material_name} onChange={(value) => setMaterialForm((current) => ({ ...current, material_name: value }))} />
        <Field label="Quantity" type="number" value={materialForm.quantity} onChange={(value) => setMaterialForm((current) => ({ ...current, quantity: value }))} />
        <Field label="Price / Unit" type="number" value={materialForm.price_per_unit} onChange={(value) => setMaterialForm((current) => ({ ...current, price_per_unit: value }))} />
        <Field label="Date" type="date" value={materialForm.date} onChange={(value) => setMaterialForm((current) => ({ ...current, date: value }))} />
        <Field label="Notes" value={materialForm.notes} onChange={(value) => setMaterialForm((current) => ({ ...current, notes: value }))} />
        <button type="submit" disabled={!selectedWorker} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          Assign Material
        </button>
      </form>
      <div className="mt-8 space-y-4">
        {materials.map((item) => (
          <AssignmentCard key={item.id} item={item} onChanged={refresh} />
        ))}
        {materials.length === 0 && <p className="text-sm text-slate-400">No material assignments yet.</p>}
      </div>
    </Card>
  );
}

function AssignmentCard({ item, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingComplete, setConfirmingComplete] = useState(false);

  const isCompleted = item.status === "completed";
  const batches = item.batches || [];

  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => setExpanded((c) => !c)} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900">{item.material_name}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                isCompleted ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-600"
              }`}
            >
              {isCompleted ? "Completed" : "Open"}
            </span>
          </div>
          <p className="text-sm text-slate-500">{item.assignment_date?.slice(0, 10)}</p>
        </button>
        <div className="text-right text-sm">
          <p className="font-medium text-slate-900">₹{Number(item.total_value || 0).toLocaleString("en-IN")}</p>
          <p className="text-slate-500">
            {item.delivered_quantity} / {item.quantity} returned
          </p>
        </div>
      </div>

      {isCompleted && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <span>
            Wastage: {item.wastage_quantity} of {item.quantity} ({item.quantity ? Math.round((item.wastage_quantity / item.quantity) * 100) : 0}%)
          </span>
          {item.over_returned && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-600">More returned than assigned — check entries</span>
          )}
        </div>
      )}

      {!isCompleted && item.balance_quantity > 0 && (
        <p className="mt-2 text-xs text-slate-400">{item.balance_quantity} still with the worker</p>
      )}

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {batches.length > 0 && (
            <div className="space-y-1.5">
              {batches.map((batch, index) => (
                <div key={index} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-700">Chunk {index + 1}: {batch.quantity} returned</span>
                  <span className="text-xs text-slate-400">
                    {batch.date ? String(batch.date).slice(0, 10) : ""}
                    {batch.notes ? ` · ${batch.notes}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!isCompleted && <AddBatchForm assignmentId={item.id} onAdded={onChanged} />}

          {!isCompleted && (
            <div>
              {!confirmingComplete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingComplete(true)}
                  className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  Mark complete
                </button>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="text-emerald-800">
                    {item.delivered_quantity} of {item.quantity} returned so far. Marking this complete will record{" "}
                    <strong>{Math.max(item.quantity - item.delivered_quantity, 0)}</strong> as wastage and lock this
                    assignment — no more chunks can be added afterward. Continue?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api.put(`/workers/materials/${item.id}/complete/`);
                          toast.success("Assignment marked complete");
                          setConfirmingComplete(false);
                          await onChanged();
                        } catch (error) {
                          toast.error(error.response?.data?.detail || "Failed to mark complete");
                        }
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingComplete(false)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddBatchForm({ assignmentId, onAdded }) {
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(event) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter how many pieces were returned in this chunk");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/workers/materials/${assignmentId}/batches/`, { quantity: qty, date, notes });
      toast.success(`Logged ${qty} returned`);
      setQuantity("");
      setNotes("");
      await onAdded();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to log returned chunk");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-lg bg-blue-50/50 p-3">
      <div className="w-28">
        <label className="text-xs font-medium text-slate-600">Chunk qty</label>
        <input
          type="number"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder="e.g. 100"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <div className="w-36">
        <label className="text-xs font-medium text-slate-600">Date</label>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex-1 min-w-[140px]">
        <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="e.g. first batch"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? "Logging…" : "Log return"}
      </button>
    </form>
  );
}

/**
 * One row in the Pay Records table. Lets the user log a partial payment
 * (mirroring material batches and bill payments) or mark the whole record
 * paid in one shot. amount_paid accumulates across partial payments, and
 * the running balance/status reflect that in real time.
 */
function PayRecordRow({ payment, onChanged }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const totalOwed = Number(payment.units_produced || 0) * Number(payment.rate_per_unit || 0);
  const paidSoFar = Number(payment.amount_paid || 0);
  const balance = Math.max(totalOwed - paidSoFar, 0);
  const isFullyPaid = payment.paid || paidSoFar >= totalOwed;

  async function handleRecordPartial(event) {
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
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid() {
    try {
      await api.put(`/workers/payments/${payment.id}/mark-paid/`);
      toast.success("Payment marked as paid");
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update payment");
    }
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3">{payment.worker_name}</td>
      <td className="px-4 py-3">{payment.product_name}</td>
      <td className="px-4 py-3">{payment.units_produced}</td>
      <td className="px-4 py-3">₹{payment.rate_per_unit}</td>
      <td className="px-4 py-3">₹{totalOwed.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3">₹{paidSoFar.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3">₹{balance.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            isFullyPaid ? "bg-emerald-50 text-emerald-600" : paidSoFar > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"
          }`}
        >
          {isFullyPaid ? "Paid" : paidSoFar > 0 ? "Partial" : "Pending"}
        </span>
      </td>
      <td className="px-4 py-3">
        {!isFullyPaid && (
          <form onSubmit={handleRecordPartial} className="flex items-center gap-1.5">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`≤ ${balance}`}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"
            >
              Pay
            </button>
            <button
              type="button"
              onClick={handleMarkPaid}
              className="rounded-lg border border-emerald-200 px-2 py-1.5 text-xs font-medium text-emerald-700"
            >
              Mark Paid
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
