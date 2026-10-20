import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  IndianRupee,
  MessageCircle,
  Plus,
  Truck,
  Users,
  X,
  BadgeCheck,
  History,
} from "lucide-react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";
import { OrderStatusBadge, ProfitConfirmationModal } from "./BillManager";
import type {
  Bill,
  BillLineProgress,
  CostItem,
  InventoryItemRef,
  ShipmentRecord,
  StockMovement,
  WorkerAssignment,
} from "./types";

interface WorkerRef {
  id: string;
  name: string;
  is_active?: boolean;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [bill, setBill] = useState<Bill | null>(null);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  const [workers, setWorkers] = useState<WorkerRef[]>([]);
  const [rawItems, setRawItems] = useState<InventoryItemRef[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingProfit, setConfirmingProfit] = useState(false);

  async function loadAll() {
    if (!id) return;
    setLoading(true);
    try {
      const [billRes, assignmentsRes, workersRes, rawRes, movementsRes] = await Promise.all([
        api.get<Bill>(`/bills/${id}/`),
        api.get<WorkerAssignment[]>(`/bills/${id}/assignments/`),
        api.get<WorkerRef[]>("/workers/"),
        api.get<InventoryItemRef[]>("/inventory/raw/"),
        api.get<StockMovement[]>(`/inventory/movements?bill_id=${id}`),
      ]);
      setBill(billRes.data);
      setAssignments(assignmentsRes.data);
      setWorkers(workersRes.data);
      setRawItems(rawRes.data);
      setMovements(movementsRes.data || []);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to load order");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reason: loadAll depends only on id
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Loading order…</div>;
  }
  if (!bill) {
    return <div className="p-8 text-center text-sm text-rose-500">Order not found.</div>;
  }

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

      <ProductionSection
        bill={bill}
        assignments={assignments}
        workers={workers}
        rawItems={rawItems}
        onChanged={loadAll}
      />

      <ShipmentSection bill={bill} onChanged={loadAll} />

      <MovementHistorySection movements={movements} workers={workers} />

      <ProfitSection
        bill={bill}
        onConfirmProfit={() => setConfirmingProfit(true)}
      />

      <CostsPanel bill={bill} onChanged={loadAll} />

      {confirmingProfit && (
        <ProfitConfirmationModal
          bill={bill}
          onClose={() => setConfirmingProfit(false)}
          onConfirmed={(updated) => {
            setBill(updated);
            setConfirmingProfit(false);
          }}
        />
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
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
              {bill.bill_type}
            </span>
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

interface ProductionSectionProps {
  bill: Bill;
  assignments: WorkerAssignment[];
  workers: WorkerRef[];
  rawItems: InventoryItemRef[];
  onChanged: () => void;
}

function ProductionSection({ bill, assignments, workers, rawItems, onChanged }: ProductionSectionProps) {
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Compute or extract line progress
  const lines: BillLineProgress[] =
    bill.lines && bill.lines.length > 0
      ? bill.lines.map((l) => {
          const matchingProd = (bill.products || []).find(
            (p) => (p.name || "").trim().toLowerCase() === (l.product_name || "").trim().toLowerCase()
          );
          return {
            ...l,
            unit: l.unit || matchingProd?.unit || "pcs",
          };
        })
      : (bill.products || []).map((p) => {
          const matchingAss = assignments.filter(
            (a) =>
              (a.material_name || "").trim().toLowerCase() === (p.name || "").trim().toLowerCase() &&
              a.status !== "cancelled"
          );
          const targeted = matchingAss.reduce((s, a) => s + Number(a.quantity || 0), 0);
          const produced = matchingAss.reduce(
            (s, a) => s + Number(a.produced_quantity ?? a.delivered_quantity ?? 0),
            0
          );
          const shipped = (bill.shipments || []).reduce((sum, sh) => {
            const shLine = (sh.items || []).find(
              (it) => it.product_name.trim().toLowerCase() === p.name.trim().toLowerCase()
            );
            return sum + (shLine?.quantity || 0);
          }, 0);
          return {
            product_name: p.name,
            unit: p.unit || "pcs",
            ordered: p.quantity,
            targeted,
            produced,
            shipped,
            ready_to_ship: Math.max(0, produced - shipped),
          };
        });

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Production</h2>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">
            Worker cost: <span className="font-semibold text-slate-900">₹{Number(bill.worker_cost_total || 0).toLocaleString("en-IN")}</span>
          </p>
          <button
            type="button"
            onClick={() => setShowAssignModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Assign to Worker
          </button>
        </div>
      </div>

      {/* Production Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-xs font-medium uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Ordered</th>
              <th className="px-4 py-3">Targeted</th>
              <th className="px-4 py-3">Produced</th>
              <th className="px-4 py-3">Shipped</th>
              <th className="px-4 py-3">Ready to Ship</th>
              <th className="px-4 py-3">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, idx) => {
              const producedPct = line.ordered > 0 ? Math.min(100, Math.round((line.produced / line.ordered) * 100)) : 0;
              const shippedPct = line.ordered > 0 ? Math.min(100, Math.round((line.shipped / line.ordered) * 100)) : 0;
              return (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{line.product_name}</td>
                  <td className="px-4 py-3 text-slate-700">{line.ordered} {line.unit || "pcs"}</td>
                  <td className="px-4 py-3 text-slate-700">{line.targeted} {line.unit || "pcs"}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{line.produced} {line.unit || "pcs"}</td>
                  <td className="px-4 py-3 text-slate-700">{line.shipped} {line.unit || "pcs"}</td>
                  <td className="px-4 py-3 font-semibold text-blue-600">{line.ready_to_ship} {line.unit || "pcs"}</td>
                  <td className="px-4 py-3">
                    <div className="w-36">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>P: {producedPct}%</span>
                        <span>S: {shippedPct}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${producedPct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Assignments Subsection */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-slate-800">Worker Material Assignments</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Raw materials issued, returned products chunks, and job status.
        </p>

        <div className="mt-4 space-y-3">
          {assignments.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              No worker assignments yet for this order. Click "Assign to Worker" above to start production.
            </p>
          )}

          {assignments.map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              onChanged={onChanged}
            />
          ))}
        </div>
      </div>

      {showAssignModal && (
        <AssignWorkerModal
          bill={bill}
          lines={lines}
          workers={workers}
          rawItems={rawItems}
          onClose={() => setShowAssignModal(false)}
          onAssigned={() => {
            setShowAssignModal(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function AssignmentRow({
  assignment,
  onChanged,
}: {
  assignment: WorkerAssignment;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showIssueRaw, setShowIssueRaw] = useState(false);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [returnedRawInput, setReturnedRawInput] = useState("0");

  const isOpen = assignment.status === "open";
  const isCompleted = assignment.status === "completed";
  const isCancelled = assignment.status === "cancelled";
  const producedQty = Number(assignment.produced_quantity ?? assignment.delivered_quantity ?? 0);
  const canCancel = isOpen && producedQty === 0;
  const batches = assignment.batches || [];

  async function handleCancel() {
    try {
      await api.put(`/workers/materials/${assignment.id}/cancel/`);
      toast.success("Assignment cancelled; raw material returned to inventory");
      onChanged();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to cancel assignment");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{assignment.worker_name || "Worker"}</span>
            <span className="text-slate-400">·</span>
            <span className="font-medium text-slate-700">{assignment.material_name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                isCompleted
                  ? "bg-emerald-50 text-emerald-700"
                  : isCancelled
                  ? "bg-slate-100 text-slate-500"
                  : "bg-blue-50 text-blue-600"
              }`}
            >
              {isCompleted ? "Completed" : isCancelled ? "Cancelled" : "Open"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {assignment.raw_item_name ? `Raw: ${assignment.raw_item_name} · ` : ""}
            Raw Issued: {assignment.raw_issued_quantity ?? assignment.quantity} · Raw Returned: {assignment.raw_returned_quantity ?? 0}
            {assignment.wastage_quantity !== undefined && ` · Wastage: ${assignment.wastage_quantity}`}
          </p>
        </div>

        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Produced {producedQty} / {assignment.quantity} {assignment.unit || "units"}
            </p>
            {assignment.wage_amount !== undefined && (
              <p className="text-xs text-slate-500">Wage: ₹{Number(assignment.wage_amount || 0).toLocaleString("en-IN")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((c) => !c)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
          {batches.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-600">Finished Output Chunks Handed In:</p>
              {batches.map((b, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                  <span className="font-medium text-slate-700">Chunk {i + 1}: {b.quantity} finished items</span>
                  <span className="text-slate-400">
                    {b.date ? String(b.date).slice(0, 10) : ""}
                    {b.notes ? ` · ${b.notes}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isOpen && (
            <div className="space-y-3">
              <AddBatchChunkForm assignmentId={assignment.id} onAdded={onChanged} />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowIssueRaw((c) => !c)}
                  className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  {showIssueRaw ? "Cancel Issue" : "+ Issue More Raw"}
                </button>

                {canCancel && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    Cancel Assignment
                  </button>
                )}
              </div>

              {showIssueRaw && (
                <IssueMoreRawForm
                  assignmentId={assignment.id}
                  onIssued={() => {
                    setShowIssueRaw(false);
                    onChanged();
                  }}
                />
              )}

              <div>
                {!confirmingComplete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingComplete(true)}
                    className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    Mark Job Complete
                  </button>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                    <p className="text-emerald-900">
                      Produced {producedQty} of {assignment.quantity} target units. Enter any unused raw material returned to restore to stock:
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        value={returnedRawInput}
                        onChange={(e) => setReturnedRawInput(e.target.value)}
                        placeholder="Raw returned"
                        className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.put(`/workers/materials/${assignment.id}/complete/`, {
                              raw_returned_quantity: Number(returnedRawInput) || 0,
                            });
                            toast.success("Assignment completed");
                            setConfirmingComplete(false);
                            onChanged();
                          } catch (err: unknown) {
                            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                            toast.error(detail ?? "Failed to complete assignment");
                          }
                        }}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingComplete(false)}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600"
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

function AddBatchChunkForm({ assignmentId, onAdded }: { assignmentId: string; onAdded: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
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
      onAdded();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to record produced chunk");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-lg bg-emerald-50/50 p-2.5">
      <div className="w-28">
        <label className="text-[11px] font-medium text-slate-600">
          <span>Batch Output</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10"
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </label>
      </div>
      <div className="w-32">
        <label className="text-[11px] font-medium text-slate-600">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </label>
      </div>
      <div className="min-w-[120px] flex-1">
        <label className="text-[11px] font-medium text-slate-600">
          <span>Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Hand In Output"}
      </button>
    </form>
  );
}

function IssueMoreRawForm({ assignmentId, onIssued }: { assignmentId: string; onIssued: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
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
      toast.success(`Issued ${qty} raw material`);
      setQuantity("");
      setNotes("");
      onIssued();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to issue raw material");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleIssue} className="flex flex-wrap items-end gap-2 rounded-lg bg-blue-50/50 p-2.5">
      <div className="w-28">
        <label className="text-[11px] font-medium text-slate-600">
          <span>Raw Qty</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 20"
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </label>
      </div>
      <div className="w-32">
        <label className="text-[11px] font-medium text-slate-600">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </label>
      </div>
      <div className="min-w-[120px] flex-1">
        <label className="text-[11px] font-medium text-slate-600">
          <span>Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? "Issuing…" : "Issue Raw"}
      </button>
    </form>
  );
}

interface AssignWorkerModalProps {
  bill: Bill;
  lines: BillLineProgress[];
  workers: WorkerRef[];
  rawItems: InventoryItemRef[];
  onClose: () => void;
  onAssigned: () => void;
}

function AssignWorkerModal({
  bill,
  lines,
  workers,
  rawItems,
  onClose,
  onAssigned,
}: AssignWorkerModalProps) {
  const activeWorkers = workers.filter((w) => w.is_active !== false);
  const [productName, setProductName] = useState(lines[0]?.product_name || "");
  const [workerId, setWorkerId] = useState(activeWorkers[0]?.id || "");
  const [rawItemId, setRawItemId] = useState(rawItems[0]?.id || "");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [rawPerUnit, setRawPerUnit] = useState("1");
  const [issueQuantity, setIssueQuantity] = useState("");
  const [wageAmount, setWageAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!productName) {
      toast.error("Select a product to produce");
      return;
    }
    if (!workerId) {
      toast.error("Select a worker");
      return;
    }
    if (!rawItemId) {
      toast.error("Select a raw material item");
      return;
    }
    const qty = Number(targetQuantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid target quantity");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/workers/${workerId}/materials/`, {
        bill_id: bill.id,
        material_name: productName,
        raw_item_id: rawItemId,
        quantity: qty,
        raw_per_unit: Number(rawPerUnit) || 1,
        issue_quantity: issueQuantity === "" ? undefined : Number(issueQuantity),
        wage_amount: Number(wageAmount) || 0,
        date: date || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Worker assigned to production");
      onAssigned();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to assign work");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Assign Work to Worker</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleAssign} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Product to Make *
              <select
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {lines.map((l, i) => (
                  <option key={i} value={l.product_name}>
                    {l.product_name} (Ordered: {l.ordered}, Targeted: {l.targeted})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Worker *
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                disabled={activeWorkers.length === 0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">{activeWorkers.length === 0 ? "No active workers" : "Select worker…"}</option>
                {activeWorkers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {activeWorkers.length === 0 && (
                <p className="mt-1 text-xs text-rose-500">No active workers found. Please add or activate a worker first.</p>
              )}
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Raw Material Item *
              <select
                value={rawItemId}
                onChange={(e) => setRawItemId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select raw item…</option>
                {rawItems.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.quantity} {r.unit} in stock)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Target Output Qty *
                <input
                  type="number"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(e.target.value)}
                  placeholder="e.g. 50"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Raw per Unit
                <input
                  type="number"
                  value={rawPerUnit}
                  onChange={(e) => setRawPerUnit(e.target.value)}
                  placeholder="1"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Raw to Issue (leave blank for whole)
                <input
                  type="number"
                  value={issueQuantity}
                  onChange={(e) => setIssueQuantity(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Flat Wage (₹)
                <input
                  type="number"
                  value={wageAmount}
                  onChange={(e) => setWageAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Assignment Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Notes
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || activeWorkers.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Assigning…" : "Assign & Issue Raw"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShipmentSection({ bill, onChanged }: { bill: Bill; onChanged: () => void }) {
  const [showShipModal, setShowShipModal] = useState(false);
  const shipments = bill.shipments || [];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Shipments & Delivery</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowShipModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-500"
        >
          <Truck className="h-3.5 w-3.5" />
          Record Shipment
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {shipments.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            No shipments logged yet. As products are finished by workers, you can dispatch them here.
          </p>
        )}

        {shipments.map((s: ShipmentRecord, idx: number) => (
          <div key={s.shipment_id || idx} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-800">
                  Shipment #{idx + 1}
                </span>
                <span className="ml-2 text-xs text-slate-400">
                  {s.date ? String(s.date).slice(0, 10) : ""}
                </span>
                {s.notes && <p className="text-xs text-slate-500 mt-0.5">{s.notes}</p>}
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                Shipped
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(s.items || []).map((it, i) => (
                <span key={i} className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700">
                  {it.product_name}: <strong>{it.quantity}</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showShipModal && (
        <RecordShipmentModal
          bill={bill}
          onClose={() => setShowShipModal(false)}
          onShipped={() => {
            setShowShipModal(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function RecordShipmentModal({
  bill,
  onClose,
  onShipped,
}: {
  bill: Bill;
  onClose: () => void;
  onShipped: () => void;
}) {
  const [shipAll, setShipAll] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const lines = bill.lines || [];

  async function handleShip(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (shipAll) {
        await api.post(`/bills/${bill.id}/shipments/`, {
          ship_all: true,
          date: date || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        const items = Object.entries(quantities)
          .filter(([, qty]) => qty > 0)
          .map(([product_name, quantity]) => ({ product_name, quantity }));

        if (items.length === 0) {
          toast.error("Enter at least one quantity or check Ship All Ready");
          setSaving(false);
          return;
        }

        await api.post(`/bills/${bill.id}/shipments/`, {
          items,
          date: date || undefined,
          notes: notes.trim() || undefined,
        });
      }

      toast.success("Shipment recorded; finished goods stock deducted");
      onShipped();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to record shipment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Record Dispatch / Shipment</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleShip} className="space-y-4 text-sm">
          <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-3">
            <label className="flex items-center gap-2 font-medium text-teal-900">
              <input
                type="checkbox"
                checked={shipAll}
                onChange={(e) => setShipAll(e.target.checked)}
                className="h-4 w-4 rounded accent-teal-600"
              />
              Ship All Ready Quantities
            </label>
            <p className="mt-1 text-xs text-teal-700">
              Dispatches everything produced and in stock for this order in one action.
            </p>
          </div>

          {!shipAll && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">Enter Quantities to Dispatch:</p>
              {lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5">
                  <div>
                    <p className="font-medium text-slate-800">{l.product_name}</p>
                    <p className="text-xs text-slate-400">Ready to ship: {l.ready_to_ship}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={l.ready_to_ship}
                    value={quantities[l.product_name] || ""}
                    onChange={(e) =>
                      setQuantities({ ...quantities, [l.product_name]: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Shipment Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Notes
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Courier tracking # or driver details"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              {saving ? "Recording…" : "Confirm Shipment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfitSection({
  bill,
  onConfirmProfit,
}: {
  bill: Bill;
  onConfirmProfit: () => void;
}) {
  const isEligible = bill.order_status === "shipped" || bill.order_status === "closed";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Profit Confirmation</h2>
        </div>

        <div>
          {bill.profit_confirmed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Profit Confirmed: ₹{Number(bill.profit_confirmed_amount || 0).toLocaleString("en-IN")}
            </span>
          ) : isEligible ? (
            <button
              type="button"
              onClick={onConfirmProfit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              Confirm Profit
            </button>
          ) : (
            <span className="text-xs text-slate-400 italic">
              Profit can be confirmed once all items are shipped
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        {!bill.profit_confirmed && !isEligible && (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            In the order-first workflow, profit calculation incorporates actual raw material consumed, final worker wages, and logged transit expenses. This order is currently <strong>{bill.order_status}</strong> and can be locked once fully shipped.
          </p>
        )}
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

function MovementHistorySection({
  movements,
  workers = [],
}: {
  movements: StockMovement[];
  workers?: WorkerRef[];
}) {
  const typeLabels: Record<string, { label: string; tone: string }> = {
    raw_issue: { label: "Raw Issue", tone: "bg-blue-50 text-blue-700 border-blue-200" },
    raw_return: { label: "Raw Return", tone: "bg-amber-50 text-amber-700 border-amber-200" },
    production_in: { label: "Production In", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    shipment_out: { label: "Shipment Out", tone: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Movement History</h2>
        </div>
        <span className="text-xs text-slate-500">
          {movements.length} {movements.length === 1 ? "movement" : "movements"} recorded
        </span>
      </div>

      {movements.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          No stock movements recorded for this order yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-xs font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Worker / Details</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => {
                const typeInfo = typeLabels[m.type] || {
                  label: m.type,
                  tone: "bg-slate-50 text-slate-700 border-slate-200",
                };
                const workerName = m.worker_id
                  ? workers.find((w) => w.id === m.worker_id)?.name || m.worker_id
                  : null;
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {m.date ? new Date(m.date).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeInfo.tone}`}
                      >
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{m.item_name}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{m.quantity}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {workerName ? `Worker: ${workerName}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{m.notes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
