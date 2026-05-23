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
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Workers" value={workers.length} />
        <MetricCard label="Active Workers" value={activeWorkers} />
        <MetricCard label="Pending Payments" value={`₹${Number(totalPending).toLocaleString("en-IN")}`} />
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
                    {["Worker", "Status", "Assigned", "Delivered", "Pending", ""].map((heading) => (
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
                      <td colSpan="6" className="px-6 py-8 text-center text-slate-400">
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
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-slate-900">Material Assignment</h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await api.post(`/workers/${selectedWorkerId}/materials/`, materialForm);
                    toast.success("Material assigned");
                    setMaterialForm(emptyMaterialForm);
                    await loadWorkerDetails(selectedWorkerId);
                    await loadWorkers();
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
              <div className="mt-8 space-y-3">
                {materials.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{item.material_name}</p>
                        <p className="text-sm text-slate-500">{item.assignment_date?.slice(0, 10)}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium text-slate-900">₹{Number(item.total_value || 0).toLocaleString("en-IN")}</p>
                        <p className="text-slate-500">{item.balance_quantity} remaining</p>
                      </div>
                    </div>
                  </div>
                ))}
                {materials.length === 0 && <p className="text-sm text-slate-400">No material assignments yet.</p>}
              </div>
            </Card>
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
                      {["Worker", "Product", "Units", "Rate", "Amount", "Paid", ""].map((heading) => (
                        <th key={heading} className="px-4 py-3 text-left font-medium">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">{payment.worker_name}</td>
                        <td className="px-4 py-3">{payment.product_name}</td>
                        <td className="px-4 py-3">{payment.units_produced}</td>
                        <td className="px-4 py-3">₹{payment.rate_per_unit}</td>
                        <td className="px-4 py-3">₹{payment.total_amount}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${payment.paid ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{payment.paid ? "Paid" : "Pending"}</span>
                        </td>
                        <td className="px-4 py-3">
                          {!payment.paid && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await api.put(`/workers/payments/${payment.id}/mark-paid/`);
                                  toast.success("Payment marked as paid");
                                  await loadWorkerDetails(selectedWorkerId);
                                  await loadWorkers();
                                } catch (error) {
                                  toast.error(error.response?.data?.detail || "Failed to update payment");
                                }
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium"
                            >
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-slate-400">
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
