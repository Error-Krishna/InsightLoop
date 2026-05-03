import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

const tabs = ["Workers List", "Material Distribution", "Pay Records"];

export default function WorkersPage() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [payments, setPayments] = useState([]);
  const [workerForm, setWorkerForm] = useState({ name: "", age: "", address: "", phone: "", joining_date: "" });
  const [materialForm, setMaterialForm] = useState({ material_name: "", quantity: "", price_per_unit: "", date: "", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ product_name: "", units_produced: "", rate_per_unit: "", amount_paid: "", date: "" });

  const selectedWorker = useMemo(() => workers.find((worker) => worker.id === selectedWorkerId), [workers, selectedWorkerId]);

  async function loadWorkers() {
    const { data } = await api.get("/workers/");
    setWorkers(data);
    if (!selectedWorkerId && data[0]) {
      setSelectedWorkerId(data[0].id);
    }
  }

  async function loadWorkerDetails(workerId) {
    if (!workerId) return;
    const [materialsResponse, paymentsResponse] = await Promise.all([api.get(`/workers/${workerId}/materials/`), api.get(`/workers/${workerId}/payments/`)]);
    setMaterials(materialsResponse.data);
    setPayments(paymentsResponse.data);
  }

  useEffect(() => {
    loadWorkers().catch(() => toast.error("Failed to load workers"));
  }, []);

  useEffect(() => {
    loadWorkerDetails(selectedWorkerId).catch(() => {});
  }, [selectedWorkerId]);

  return (
    <div className="space-y-6">
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

      {activeTab === "Workers List" && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-slate-900">Add Worker</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await api.post("/workers/", workerForm);
                toast.success("Worker created");
                setWorkerForm({ name: "", age: "", address: "", phone: "", joining_date: "" });
                loadWorkers();
              }}
              className="mt-6 grid gap-4 md:grid-cols-2"
            >
              {[
                ["name", "Name"],
                ["age", "Age"],
                ["address", "Address"],
                ["phone", "Phone"],
                ["joining_date", "Joining Date"],
              ].map(([key, label]) => (
                <label key={key} className="text-sm font-medium text-slate-700">
                  {label}
                  <input value={workerForm[key]} onChange={(event) => setWorkerForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3" />
                </label>
              ))}
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
                Save Worker
              </button>
            </form>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Workers</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {["Name", "Assigned", "Delivered", "Pending"].map((heading) => (
                      <th key={heading} className="px-6 py-3 text-left font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workers.map((worker) => (
                    <tr key={worker.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{worker.name}</td>
                      <td className="px-6 py-4">{worker.material_assigned}</td>
                      <td className="px-6 py-4">{worker.material_delivered}</td>
                      <td className="px-6 py-4">₹{Number(worker.pending_amount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
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
              {workers.map((worker) => (
                <button
                  type="button"
                  key={worker.id}
                  onClick={() => setSelectedWorkerId(worker.id)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${selectedWorkerId === worker.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"}`}
                >
                  {worker.name}
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
                  await api.post(`/workers/${selectedWorkerId}/materials/`, materialForm);
                  toast.success("Material assigned");
                  setMaterialForm({ material_name: "", quantity: "", price_per_unit: "", date: "", notes: "" });
                  loadWorkerDetails(selectedWorkerId);
                }}
                className="mt-6 grid gap-4 md:grid-cols-2"
              >
                {[
                  ["material_name", "Material Name"],
                  ["quantity", "Quantity"],
                  ["price_per_unit", "Price / Unit"],
                  ["date", "Date"],
                  ["notes", "Notes"],
                ].map(([key, label]) => (
                  <label key={key} className="text-sm font-medium text-slate-700">
                    {label}
                    <input value={materialForm[key]} onChange={(event) => setMaterialForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3" />
                  </label>
                ))}
                <button type="submit" disabled={!selectedWorker} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  Assign Material
                </button>
              </form>
              <div className="mt-8 space-y-3">
                {materials.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{item.material_name}</p>
                        <p className="text-sm text-slate-500">{item.assignment_date?.slice(0, 10)}</p>
                      </div>
                      <p className="text-sm text-slate-700">{item.balance_quantity} remaining</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-slate-900">Pay Records</h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  await api.post(`/workers/${selectedWorkerId}/payments/`, paymentForm);
                  toast.success("Payment record created");
                  setPaymentForm({ product_name: "", units_produced: "", rate_per_unit: "", amount_paid: "", date: "" });
                  loadWorkerDetails(selectedWorkerId);
                }}
                className="mt-6 grid gap-4 md:grid-cols-2"
              >
                {[
                  ["product_name", "Product"],
                  ["units_produced", "Units"],
                  ["rate_per_unit", "Rate / Unit"],
                  ["amount_paid", "Amount Paid"],
                  ["date", "Date"],
                ].map(([key, label]) => (
                  <label key={key} className="text-sm font-medium text-slate-700">
                    {label}
                    <input value={paymentForm[key]} onChange={(event) => setPaymentForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3" />
                  </label>
                ))}
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
                  Save Payment
                </button>
              </form>
              <div className="mt-8 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      {["Worker", "Product", "Units", "Rate", "Amount", "Status", ""].map((heading) => (
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
                                await api.put(`/workers/payments/${payment.id}/mark-paid/`);
                                toast.success("Payment marked as paid");
                                loadWorkerDetails(selectedWorkerId);
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium"
                            >
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
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
