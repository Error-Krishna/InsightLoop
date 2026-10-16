import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  IndianRupee,
  MessageCircle,
  Package,
  Plus,
  Truck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";
import { OrderStatusBadge } from "./BillManager";
import type { Bill, CostItem, InventoryItemRef, ReadyToDeliverBatch } from "./types";

interface WorkerAssignment {
  id: string;
  worker_id?: string;
  worker_name?: string;
  material_name?: string;
  quantity: number;
  delivered_quantity?: number;
  wage_amount?: number;
  status?: string;
}

interface WorkerRef {
  id: string;
  name: string;
}

/**
 * The single-order lifecycle view: everything that happens to an order
 * after it's billed -- production (worker assignments), ready-to-deliver
 * stock, transportation/misc costs, and shipment confirmation -- lives
 * here, tied to one bill. This is the page that turns "create a bill" into
 * a full order workflow: new order -> bill -> production -> shipment ->
 * payment -> profit confirmation -> closed.
 */
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [bill, setBill] = useState<Bill | null>(null);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  const [workers, setWorkers] = useState<WorkerRef[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRef[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    if (!id) return;
    setLoading(true);
    try {
      const [billRes, assignmentsRes, workersRes, finishedRes, semiRes] = await Promise.all([
        api.get<Bill>(`/bills/${id}/`),
        api.get<WorkerAssignment[]>(`/bills/${id}/assignments/`),
        api.get<WorkerRef[]>("/workers/"),
        api.get<InventoryItemRef[]>("/inventory/finished/"),
        api.get<InventoryItemRef[]>("/inventory/semi-finished/"),
      ]);
      setBill(billRes.data);
      setAssignments(assignmentsRes.data);
      setWorkers(workersRes.data);
      setInventoryItems([...finishedRes.data, ...semiRes.data]);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to load order");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reason: loadAll is stable and depends only on id
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Loading order…</div>;
  }
  if (!bill) {
    return <div className="p-8 text-center text-sm text-rose-500">Order not found.</div>;
  }

  const canManageProduction = bill.bill_type === "pakka";

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(`/bills/${bill.bill_type}`)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {bill.bill_type === "pakka" ? "Pakka" : "Kacha"} Bills
      </button>

      <OrderHeader bill={bill} />

      {!canManageProduction && (
        <Card className="p-5">
          <p className="text-sm text-slate-500">
            This is a kacha (informal) bill. Production, ready-to-deliver tracking, transportation/misc costs, and
            shipment are only available once the order is confirmed by converting it to a pakka bill — use the
            Convert action from the bill list.
          </p>
        </Card>
      )}

      {canManageProduction && (
        <>
          <ProductionPanel
            bill={bill}
            assignments={assignments}
            workers={workers}
            onChanged={loadAll}
          />
          <ReadyToDeliverPanel bill={bill} inventoryItems={inventoryItems} onChanged={loadAll} />
          <CostsPanel bill={bill} onChanged={loadAll} />
        </>
      )}
    </div>
  );
}

function OrderHeader({ bill }: { bill: Bill }) {
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const response = await api.get(`/bills/${bill.id}/pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bill.invoice_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  async function shareWhatsapp() {
    if (!bill.buyer?.phone) {
      toast.error("Add a phone number to this bill's buyer details first");
      return;
    }
    setSharing(true);
    try {
      await api.post(`/bills/${bill.id}/share-whatsapp/`);
      toast.success(`Bill sent to ${bill.buyer.phone} on WhatsApp`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to send via WhatsApp");
    } finally {
      setSharing(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{bill.invoice_number}</h1>
            <OrderStatusBadge status={bill.order_status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {bill.buyer?.name || "—"} {bill.buyer?.phone && `· ${bill.buyer.phone}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={shareWhatsapp}
            disabled={sharing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Grand Total" value={`₹${Number(bill.grand_total || 0).toLocaleString("en-IN")}`} />
        <MiniStat label="Received" value={`₹${Number(bill.amount_received || 0).toLocaleString("en-IN")}`} tone="emerald" />
        <MiniStat label="Balance Due" value={`₹${Number(bill.balance_due || 0).toLocaleString("en-IN")}`} tone="amber" />
        <MiniStat
          label="Profit"
          value={bill.profit_confirmed ? `₹${Number(bill.profit_confirmed_amount || 0).toLocaleString("en-IN")}` : "Not confirmed"}
          tone={bill.profit_confirmed ? "emerald" : "slate"}
        />
      </div>
    </Card>
  );
}

function MiniStat({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "amber" }) {
  const toneClasses = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
  };
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-semibold ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}

interface ProductionPanelProps {
  bill: Bill;
  assignments: WorkerAssignment[];
  workers: WorkerRef[];
  onChanged: () => void;
}

function ProductionPanel({ bill, assignments, workers, onChanged }: ProductionPanelProps) {
  const [showAssignForm, setShowAssignForm] = useState(false);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Production</h2>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">
            Worker cost so far: <span className="font-semibold text-slate-900">₹{Number(bill.worker_cost_total || 0).toLocaleString("en-IN")}</span>
          </p>
          <button
            type="button"
            onClick={() => setShowAssignForm((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Assign Worker
          </button>
        </div>
      </div>

      {showAssignForm && (
        <AssignWorkerForm
          billId={bill.id}
          workers={workers}
          onAssigned={() => {
            setShowAssignForm(false);
            onChanged();
          }}
        />
      )}

      <div className="mt-4 space-y-3">
        {assignments.length === 0 && (
          <p className="text-sm text-slate-400">
            No production work assigned to this order yet. Assign a worker above to start tracking it.
          </p>
        )}
        {assignments.map((a) => (
          <div key={a.id} className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">
                  {a.worker_name} · {a.material_name}
                </p>
                <p className="text-sm text-slate-500">
                  {a.delivered_quantity ?? 0} / {a.quantity} returned
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    a.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {a.status === "completed" ? "Complete" : "In progress"}
                </span>
                {a.status === "completed" && (
                  <p className="mt-1 text-xs text-slate-500">Wage due: ₹{Number(a.wage_amount || 0).toLocaleString("en-IN")}</p>
                )}
              </div>
            </div>
            {a.status !== "completed" && (
              <p className="mt-2 text-xs text-slate-400">
                Manage returns and mark this job complete from the worker's Material Distribution tab — the wage
                becomes due here automatically once it's marked complete.
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

interface AssignWorkerFormProps {
  billId: string;
  workers: WorkerRef[];
  onAssigned: () => void;
}

function AssignWorkerForm({ billId, workers, onAssigned }: AssignWorkerFormProps) {
  const [workerId, setWorkerId] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [wageAmount, setWageAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!workerId) {
      toast.error("Select a worker");
      return;
    }
    if (!materialName.trim()) {
      toast.error("Enter what material/product is being produced");
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/workers/${workerId}/materials/`, {
        material_name: materialName,
        quantity: qty,
        price_per_unit: Number(pricePerUnit) || 0,
        wage_amount: Number(wageAmount) || 0,
        bill_id: billId,
      });
      toast.success("Work assigned to worker");
      setMaterialName("");
      setQuantity("");
      setPricePerUnit("");
      setWageAmount("");
      setWorkerId("");
      onAssigned();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to assign work");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleAssign} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          <span>Worker</span>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Select worker…</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          <span>Material / Product</span>
          <input
            value={materialName}
            onChange={(e) => setMaterialName(e.target.value)}
            placeholder="e.g. Large Jute Bag"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          <span>Quantity handed out</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 500"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          <span>Raw material value / unit (₹)</span>
          <input
            type="number"
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">
          <span>Worker's flat wage for this job (₹) — paid regardless of exact quantity returned</span>
          <input
            type="number"
            value={wageAmount}
            onChange={(e) => setWageAmount(e.target.value)}
            placeholder="e.g. 5000"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="md:col-span-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? "Assigning…" : "Assign Work"}
      </button>
    </form>
  );
}

interface ReadyToDeliverPanelProps {
  bill: Bill;
  inventoryItems: InventoryItemRef[];
  onChanged: () => void;
}

function ReadyToDeliverPanel({ bill, inventoryItems, onChanged }: ReadyToDeliverPanelProps) {
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingShipment, setConfirmingShipment] = useState(false);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!itemId) {
      toast.error("Select an inventory item");
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/bills/${bill.id}/ready-to-deliver/`, { inventory_item_id: itemId, quantity: qty });
      toast.success("Batch marked ready to deliver");
      setItemId("");
      setQuantity("");
      onChanged();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to add batch");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmShipment() {
    try {
      await api.post(`/bills/${bill.id}/confirm-shipment/`);
      toast.success("Shipment confirmed — stock removed from inventory");
      setConfirmingShipment(false);
      onChanged();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to confirm shipment");
    }
  }

  const batches = bill.ready_to_deliver || [];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Ready to Deliver</h2>
        </div>
        <p className="text-sm text-slate-500">
          Total earmarked: <span className="font-semibold text-slate-900">{bill.ready_to_deliver_quantity || 0}</span>
        </p>
      </div>

      {bill.shipment_confirmed ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="mr-1 inline h-4 w-4" />
          Shipment confirmed on {bill.shipment_confirmed_at ? new Date(bill.shipment_confirmed_at).toLocaleDateString("en-IN") : "—"}.
          Stock for this order has been removed from inventory.
        </p>
      ) : (
        <>
          <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-4">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                <span>Finished item</span>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select item…</option>
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.quantity} {item.unit} in stock)
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                <span>Quantity</span>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 100"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add Batch"}
            </button>
          </form>

          {batches.length > 0 && (
            <div className="mt-4">
              {!confirmingShipment ? (
                <button
                  type="button"
                  onClick={() => setConfirmingShipment(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
                >
                  <Truck className="h-4 w-4" />
                  Confirm Shipment
                </button>
              ) : (
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm">
                  <p className="text-teal-800">
                    This will remove {bill.ready_to_deliver_quantity} unit(s) from inventory as safely shipped. This
                    cannot be undone. Continue?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmShipment}
                      className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-500"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingShipment(false)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-4 space-y-1.5">
        {batches.map((batch: ReadyToDeliverBatch, index: number) => (
          <div key={index} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-700">
              {batch.item_name || "Item"} · {batch.quantity} units
            </span>
            <span className="text-xs text-slate-400">{batch.date ? String(batch.date).slice(0, 10) : ""}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CostsPanel({ bill, onChanged }: { bill: Bill; onChanged: () => void }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <IndianRupee className="h-4 w-4 text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Order Costs</h2>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CostLog
          title="Transportation"
          total={bill.transportation_cost_total}
          entries={bill.transportation_costs}
          onAdd={async (amount, notes) => {
            await api.post(`/bills/${bill.id}/transportation-cost/`, { amount, notes });
            onChanged();
          }}
        />
        <CostLog
          title="Miscellaneous"
          total={bill.misc_cost_total}
          entries={bill.misc_costs}
          onAdd={async (amount, notes) => {
            await api.post(`/bills/${bill.id}/misc-cost/`, { amount, notes });
            onChanged();
          }}
        />
      </div>
    </Card>
  );
}

interface CostLogProps {
  title: string;
  total?: number;
  entries?: CostItem[];
  onAdd: (amount: number, notes?: string) => Promise<void>;
}

function CostLog({ title, total, entries, onAdd }: CostLogProps) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await onAdd(value, notes);
      toast.success(`${title} cost logged`);
      setAmount("");
      setNotes("");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? `Failed to log ${title.toLowerCase()} cost`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="text-sm font-semibold text-slate-900">₹{Number(total || 0).toLocaleString("en-IN")}</span>
      </div>
      <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-24">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₹"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </div>
        <div className="min-w-[100px] flex-1">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      <div className="mt-3 space-y-1">
        {(entries || []).map((entry, index) => (
          <div key={index} className="flex items-center justify-between text-xs text-slate-500">
            <span>
              ₹{Number(entry.amount || 0).toLocaleString("en-IN")}
              {entry.notes ? ` · ${entry.notes}` : ""}
            </span>
            <span>{entry.date ? String(entry.date).slice(0, 10) : ""}</span>
          </div>
        ))}
        {(!entries || entries.length === 0) && <p className="text-xs text-slate-400">No entries yet.</p>}
      </div>
    </div>
  );
}
