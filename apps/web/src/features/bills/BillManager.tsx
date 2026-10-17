import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  BadgeCheck,
  Download,
  ExternalLink,
  IndianRupee,
  MessageCircle,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";
import type { Bill, BillItem, ProfitPreviewResponse } from "./types";

const GST_RATES = [0, 5, 12, 18, 28];

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "grand_total:desc", label: "Amount: high to low" },
  { value: "grand_total:asc", label: "Amount: low to high" },
  { value: "invoice_number:asc", label: "Invoice number (A-Z)" },
  { value: "buyer_name:asc", label: "Buyer name (A-Z)" },
];

interface BillManagerProps {
  billType: "kacha" | "pakka";
  refreshKey?: number;
  onChanged?: () => void;
}

export default function BillManager({ billType, refreshKey, onChanged }: BillManagerProps) {
  const navigate = useNavigate();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("created_at:desc");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [convertingBill, setConvertingBill] = useState<Bill | null>(null);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [confirmingBill, setConfirmingBill] = useState<Bill | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<Bill[]>(`/bills/?type=${billType}`);
      setBills(data);
    } catch {
      toast.error("Failed to load bills");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reason: load runs when billType or refreshKey changes
  }, [billType, refreshKey]);

  const filteredSortedBills = useMemo(() => {
    const query = search.trim().toLowerCase();
    const min = minAmount !== "" ? Number(minAmount) : null;
    const max = maxAmount !== "" ? Number(maxAmount) : null;
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;

    let result = bills.filter((bill) => {
      const matchesQuery =
        !query ||
        [bill.invoice_number, bill.buyer?.name, bill.buyer?.phone, bill.buyer?.gst_number].some((value) =>
          String(value || "").toLowerCase().includes(query),
        );
      const amount = Number(bill.grand_total || 0);
      const matchesMin = min === null || amount >= min;
      const matchesMax = max === null || amount <= max;
      const createdAt = bill.created_at ? new Date(bill.created_at) : null;
      const matchesFrom = !from || (createdAt !== null && createdAt >= from);
      const matchesTo = !to || (createdAt !== null && createdAt <= new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1));
      return matchesQuery && matchesMin && matchesMax && matchesFrom && matchesTo;
    });

    const [sortField, sortDir] = sort.split(":");
    result = [...result].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      if (sortField === "buyer_name") {
        aVal = (a.buyer?.name || "").toLowerCase();
        bVal = (b.buyer?.name || "").toLowerCase();
      } else if (sortField === "created_at") {
        aVal = new Date(a.created_at || 0).getTime();
        bVal = new Date(b.created_at || 0).getTime();
      } else if (sortField === "grand_total") {
        aVal = Number(a.grand_total || 0);
        bVal = Number(b.grand_total || 0);
      } else {
        aVal = String((a as unknown as Record<string, unknown>)[sortField] ?? "").toLowerCase();
        bVal = String((b as unknown as Record<string, unknown>)[sortField] ?? "").toLowerCase();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [bills, search, sort, minAmount, maxAmount, dateFrom, dateTo]);

  function clearFilters() {
    setSearch("");
    setMinAmount("");
    setMaxAmount("");
    setDateFrom("");
    setDateTo("");
  }

  const filtersActive = search || minAmount !== "" || maxAmount !== "" || dateFrom || dateTo;

  async function downloadBillPdf(bill: Bill) {
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
    }
  }

  async function shareBillOnWhatsApp(bill: Bill) {
    if (!bill.buyer?.phone) {
      toast.error("Add a phone number to this bill's buyer details first");
      return;
    }
    setSharingId(bill.id);
    try {
      await api.post(`/bills/${bill.id}/share-whatsapp/`);
      toast.success(`Bill sent to ${bill.buyer.phone} on WhatsApp`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to send via WhatsApp");
    } finally {
      setSharingId(null);
    }
  }

  async function deleteBill(bill: Bill) {
    if (!window.confirm(`Delete bill ${bill.invoice_number}? This cannot be undone and will restore any linked inventory stock.`)) {
      return;
    }
    setDeletingId(bill.id);
    try {
      await api.delete(`/bills/${bill.id}/`);
      toast.success("Bill deleted");
      setBills((c) => c.filter((b) => b.id !== bill.id));
      onChanged?.();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to delete bill");
    } finally {
      setDeletingId(null);
    }
  }

  function handleSaved(updatedBill: Bill) {
    setBills((c) => c.map((b) => (b.id === updatedBill.id ? updatedBill : b)));
    setEditingBill(null);
    onChanged?.();
  }

  function handleConverted(updatedBill: Bill) {
    setBills((c) => c.filter((b) => b.id !== updatedBill.id));
    setConvertingBill(null);
    onChanged?.();
    toast.success(`Converted to pakka bill ${updatedBill.invoice_number}`);
  }

  function handleBillUpdated(updatedBill: Bill) {
    setBills((c) => c.map((b) => (b.id === updatedBill.id ? updatedBill : b)));
    onChanged?.();
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            All {billType === "pakka" ? "Pakka" : "Kacha"} Bills
            <span className="ml-2 text-sm font-normal text-slate-400">({filteredSortedBills.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search + filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, buyer name, phone, or GST no."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="Min ₹"
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <input
            type="number"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            placeholder="Max ₹"
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <span className="text-sm text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-400">Loading bills…</div>
      ) : filteredSortedBills.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">
          {bills.length === 0 ? "No bills yet. Create one above." : "No bills match the current search/filters."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Buyer</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Order Status</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Payment</th>
                <th className="px-5 py-3">Profit</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredSortedBills.map((bill) => (
                <tr key={bill.id} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-900">
                    <button
                      type="button"
                      onClick={() => navigate(`/bills/order/${bill.id}`)}
                      className="hover:underline"
                    >
                      {bill.invoice_number}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-800">{bill.buyer?.name || "—"}</p>
                    {bill.buyer?.phone && <p className="text-xs text-slate-400">{bill.buyer.phone}</p>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">
                    {bill.created_at ? new Date(bill.created_at).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <OrderStatusBadge status={bill.order_status} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold text-slate-900">
                    ₹{Number(bill.grand_total || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-5 py-3.5">
                    <PaymentStatusBadge bill={bill} />
                  </td>
                  <td className="px-5 py-3.5">
                    {bill.profit_confirmed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <BadgeCheck className="h-3 w-3" /> ₹{Number(bill.profit_confirmed_amount || 0).toLocaleString("en-IN")}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Not confirmed</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <ActionButton
                        title="View order details"
                        onClick={() => navigate(`/bills/order/${bill.id}`)}
                        tone="blue"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </ActionButton>
                      <ActionButton
                        title="Record customer payment"
                        onClick={() => setPayingBill(bill)}
                        tone="green"
                      >
                        <IndianRupee className="h-3.5 w-3.5" />
                      </ActionButton>
                      <ActionButton title="Download PDF" onClick={() => downloadBillPdf(bill)}>
                        <Download className="h-3.5 w-3.5" />
                      </ActionButton>
                      <ActionButton
                        title={bill.buyer?.phone ? "Share via WhatsApp" : "Add buyer phone to enable WhatsApp share"}
                        onClick={() => shareBillOnWhatsApp(bill)}
                        disabled={sharingId === bill.id}
                        tone="emerald"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </ActionButton>
                      <ActionButton title="Edit bill" onClick={() => setEditingBill(bill)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </ActionButton>
                      {billType === "kacha" && (
                        <ActionButton
                          title="Convert to pakka"
                          onClick={() => setConvertingBill(bill)}
                          tone="blue"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </ActionButton>
                      )}
                      {bill.payment_status === "paid" && !bill.profit_confirmed && (
                        <ActionButton
                          title="Confirm profit for this consignment"
                          onClick={() => setConfirmingBill(bill)}
                          tone="green"
                        >
                          <BadgeCheck className="h-3.5 w-3.5" />
                        </ActionButton>
                      )}
                      <ActionButton
                        title="Delete bill"
                        onClick={() => deleteBill(bill)}
                        disabled={deletingId === bill.id}
                        tone="rose"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingBill && (
        <EditBillModal bill={editingBill} billType={billType} onClose={() => setEditingBill(null)} onSaved={handleSaved} />
      )}

      {convertingBill && (
        <ConvertToPakkaModal bill={convertingBill} onClose={() => setConvertingBill(null)} onConverted={handleConverted} />
      )}

      {payingBill && (
        <RecordPaymentModal bill={payingBill} onClose={() => setPayingBill(null)} onUpdated={handleBillUpdated} />
      )}

      {confirmingBill && (
        <ProfitConfirmationModal
          bill={confirmingBill}
          onClose={() => setConfirmingBill(null)}
          onConfirmed={(updated) => {
            handleBillUpdated(updated);
            setConfirmingBill(null);
          }}
        />
      )}
    </Card>
  );
}

interface ActionButtonProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "slate" | "emerald" | "green" | "blue" | "rose";
  children: React.ReactNode;
}

function ActionButton({ title, onClick, disabled, tone = "slate", children }: ActionButtonProps) {
  const toneClasses = {
    slate: "border-slate-200 text-slate-500 hover:bg-slate-50",
    emerald: "border-emerald-200 text-emerald-600 hover:bg-emerald-50",
    green: "border-green-200 text-green-600 hover:bg-green-50",
    blue: "border-blue-200 text-blue-600 hover:bg-blue-50",
    rose: "border-rose-200 text-rose-500 hover:bg-rose-50",
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-50 ${toneClasses[tone]}`}
    >
      {children}
    </button>
  );
}

function PaymentStatusBadge({ bill }: { bill: Bill }) {
  const status = bill.payment_status || "unpaid";
  const styles: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700",
    partial: "bg-amber-50 text-amber-700",
    unpaid: "bg-slate-100 text-slate-500",
  };
  const labels: Record<string, string> = {
    paid: "Paid in full",
    partial: `₹${Number(bill.balance_due || 0).toLocaleString("en-IN")} due`,
    unpaid: "Unpaid",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    draft: "bg-slate-100 text-slate-500",
    confirmed: "bg-blue-50 text-blue-600",
    in_production: "bg-amber-50 text-amber-700",
    ready_to_ship: "bg-purple-50 text-purple-700",
    shipped: "bg-teal-50 text-teal-700",
    closed: "bg-emerald-50 text-emerald-700",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    confirmed: "Confirmed",
    in_production: "In production",
    ready_to_ship: "Ready to ship",
    shipped: "Shipped",
    closed: "Closed",
  };
  const key = status || "draft";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${styles[key] || styles.draft}`}>
      {labels[key] || key}
    </span>
  );
}

interface EditBillModalProps {
  bill: Bill;
  billType: "kacha" | "pakka";
  onClose: () => void;
  onSaved: (bill: Bill) => void;
}

function EditBillModal({ bill, billType, onClose, onSaved }: EditBillModalProps) {
  const isPakka = billType === "pakka";
  const [form, setForm] = useState({
    buyer_name: bill.buyer?.name || "",
    buyer_address: bill.buyer?.address || "",
    buyer_phone: bill.buyer?.phone || "",
    gst_number: bill.buyer?.gst_number || "",
    gst_percentage: bill.gst_percentage ?? (isPakka ? 18 : 0),
    discount: bill.discount ?? 0,
    products: (bill.products || []).map((p) => ({ ...p })),
  });
  const [saving, setSaving] = useState(false);

  const subtotal = useMemo(
    () => form.products.reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.rate || 0), 0),
    [form.products],
  );
  const discount = Number(form.discount || 0);
  const taxable = Math.max(subtotal - discount, 0);
  const gstAmount = isPakka ? (taxable * Number(form.gst_percentage || 0)) / 100 : 0;
  const grandTotal = taxable + gstAmount;

  function updateProduct(index: number, field: keyof BillItem, value: BillItem[keyof BillItem]) {
    setForm((c) => ({
      ...c,
      products: c.products.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  }

  function removeProduct(index: number) {
    setForm((c) => {
      const next = c.products.filter((_, i) => i !== index);
      return { ...c, products: next.length ? next : [{ name: "", quantity: 1, rate: 0, unit: "pcs" }] };
    });
  }

  function addProduct() {
    setForm((c) => ({ ...c, products: [...c.products, { name: "", quantity: 1, rate: 0, unit: "pcs" }] }));
  }

  async function handleSave() {
    if (!form.buyer_name.trim()) {
      toast.error("Buyer name is required");
      return;
    }
    if (form.products.every((p) => !p.name.trim())) {
      toast.error("Add at least one product");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put<Bill>(`/bills/${bill.id}/`, form);
      toast.success("Bill updated");
      onSaved(data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to update bill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Edit Bill · {bill.invoice_number}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModalInput label="Buyer Name *" value={form.buyer_name} onChange={(v) => setForm((c) => ({ ...c, buyer_name: v }))} />
          <ModalInput label="Buyer Address" value={form.buyer_address} onChange={(v) => setForm((c) => ({ ...c, buyer_address: v }))} />
          <ModalInput label="Buyer Phone" value={form.buyer_phone} onChange={(v) => setForm((c) => ({ ...c, buyer_phone: v }))} />
          {isPakka && (
            <>
              <ModalInput label="GST Number" value={form.gst_number} onChange={(v) => setForm((c) => ({ ...c, gst_number: v }))} />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  <span>GST Rate</span>
                  <select
                    value={form.gst_percentage}
                    onChange={(e) => setForm((c) => ({ ...c, gst_percentage: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>{r}%</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
          <ModalInput label="Discount (₹)" type="number" value={String(form.discount)} onChange={(v) => setForm((c) => ({ ...c, discount: Number(v) || 0 }))} />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">Products</h4>
            <button type="button" onClick={addProduct} className="text-xs font-medium text-blue-600 hover:underline">
              + Add row
            </button>
          </div>
          <div className="space-y-2">
            {form.products.map((product, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2">
                <ModalInput hideLabel value={product.name} onChange={(v) => updateProduct(i, "name", v)} placeholder="Product name" />
                <ModalInput hideLabel type="number" value={String(product.quantity)} onChange={(v) => updateProduct(i, "quantity", Number(v) || 0)} placeholder="Qty" />
                <ModalInput hideLabel type="number" value={String(product.rate)} onChange={(v) => updateProduct(i, "rate", Number(v) || 0)} placeholder="Rate" />
                <ModalInput hideLabel value={product.unit} onChange={(v) => updateProduct(i, "unit", v)} placeholder="Unit" />
                <button
                  type="button"
                  onClick={() => removeProduct(i)}
                  className="flex items-center justify-center rounded-lg border border-rose-200 text-rose-400 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Discount</span>
              <span>-₹{discount.toFixed(2)}</span>
            </div>
          )}
          {isPakka && (
            <div className="flex justify-between text-slate-600">
              <span>GST ({form.gst_percentage}%)</span>
              <span>₹{gstAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <span>Grand Total</span>
            <span>₹{grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConvertToPakkaModalProps {
  bill: Bill;
  onClose: () => void;
  onConverted: (bill: Bill) => void;
}

function ConvertToPakkaModal({ bill, onClose, onConverted }: ConvertToPakkaModalProps) {
  const [gstNumber, setGstNumber] = useState(bill.buyer?.gst_number || "");
  const [gstPercentage, setGstPercentage] = useState(18);
  const [converting, setConverting] = useState(false);

  async function handleConvert() {
    if (!gstNumber.trim()) {
      toast.error("GST number is required to convert to a pakka bill");
      return;
    }
    setConverting(true);
    try {
      const { data } = await api.post<Bill>(`/bills/${bill.id}/convert/`, {
        gst_number: gstNumber.trim(),
        gst_percentage: gstPercentage,
      });
      onConverted(data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to convert bill");
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Convert to Pakka Bill</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Invoice <strong>{bill.invoice_number}</strong> will become a GST-compliant tax invoice with a new
          invoice number. This cannot be undone.
        </p>

        <div className="space-y-3">
          <ModalInput
            label="GST Number *"
            value={gstNumber}
            onChange={setGstNumber}
            placeholder="22AAAAA0000A1Z5"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              <span>GST Percentage *</span>
              <select
                value={gstPercentage}
                onChange={(e) => setGstPercentage(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConvert}
            disabled={converting}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {converting ? "Converting…" : "Convert to Pakka"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ModalInputProps {
  label?: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}

function ModalInput({ label, hideLabel = false, value, onChange, type = "text", placeholder }: ModalInputProps) {
  return (
    <div>
      {!hideLabel && label && <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

interface RecordPaymentModalProps {
  bill: Bill;
  onClose: () => void;
  onUpdated: (bill: Bill) => void;
}

function RecordPaymentModal({ bill, onClose, onUpdated }: RecordPaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const payments = bill.payments || [];

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter how much the customer paid");
      return;
    }
    if (value > (bill.balance_due || 0) + 0.01) {
      const proceed = window.confirm(
        `This is more than the outstanding balance of ₹${(bill.balance_due || 0).toFixed(2)}. Record it anyway?`,
      );
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<Bill>(`/bills/${bill.id}/record-payment/`, { amount: value, date, notes });
      toast.success(`₹${value.toLocaleString("en-IN")} recorded`);
      setAmount("");
      setNotes("");
      onUpdated(data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Record Payment · {bill.invoice_number}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{bill.buyer?.name || "Customer"}</p>

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-sm">
          <div>
            <p className="text-xs text-slate-400">Total</p>
            <p className="font-semibold text-slate-900">₹{Number(bill.grand_total || 0).toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Received</p>
            <p className="font-semibold text-emerald-600">₹{Number(bill.amount_received || 0).toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Balance Due</p>
            <p className="font-semibold text-amber-600">₹{Number(bill.balance_due || 0).toLocaleString("en-IN")}</p>
          </div>
        </div>

        {bill.over_received && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
            More has been recorded as received than the bill total — double check the entries below.
          </p>
        )}

        {bill.payment_status === "paid" ? (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            This bill is fully paid.{!bill.profit_confirmed && " You can now confirm profit for it from the bill list."}
          </p>
        ) : (
          <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-blue-50/50 p-3">
            <div className="w-28">
              <label className="text-xs font-medium text-slate-600">
                <span>Amount (₹)</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`up to ${bill.balance_due || 0}`}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="w-36">
              <label className="text-xs font-medium text-slate-600">
                <span>Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="min-w-[120px] flex-1">
              <label className="text-xs font-medium text-slate-600">
                <span>Notes (optional)</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. cash, UPI"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Recording…" : "Record"}
            </button>
          </form>
        )}

        <h4 className="mb-2 text-sm font-semibold text-slate-700">Payment History</h4>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400">No payments recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {payments.map((payment, index) => (
              <div key={index} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">₹{Number(payment.amount || 0).toLocaleString("en-IN")}</span>
                <span className="text-xs text-slate-400">
                  {payment.date ? String(payment.date).slice(0, 10) : ""}
                  {payment.notes ? ` · ${payment.notes}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProfitConfirmationModalProps {
  bill: Bill;
  onClose: () => void;
  onConfirmed: (bill: Bill) => void;
}

function ProfitConfirmationModal({ bill, onClose, onConfirmed }: ProfitConfirmationModalProps) {
  const [loading, setLoading] = useState(true);
  const [suggestion, setSuggestion] = useState<ProfitPreviewResponse | null>(null);
  const [override, setOverride] = useState("");
  const [useOverride, setUseOverride] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      setLoading(true);
      try {
        const { data } = await api.get<ProfitPreviewResponse>(`/bills/${bill.id}/profit-preview/`);
        if (!cancelled) setSuggestion(data);
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (!cancelled) toast.error(detail ?? "Failed to compute profit preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [bill.id]);

  async function handleConfirm() {
    setConfirming(true);
    try {
      const payload = useOverride && override !== "" ? { confirmed_amount: Number(override) } : {};
      const { data } = await api.post<Bill>(`/bills/${bill.id}/confirm-profit/`, payload);
      toast.success("Profit confirmed for this consignment");
      onConfirmed(data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to confirm profit");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Confirm Profit · {bill.invoice_number}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          This consignment is fully paid. Review the suggested profit below — you can adjust it if something about
          this sale (damage, a special arrangement) isn't reflected in the numbers.
        </p>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-400">Calculating…</p>
        ) : suggestion ? (
          <>
            <div className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Revenue collected</span>
                <span className="font-medium text-slate-900">₹{suggestion.revenue_collected.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Material cost</span>
                <span className="font-medium text-slate-900">-₹{suggestion.cost_breakdown.material_cost.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Worker (production) cost</span>
                <span className="font-medium text-slate-900">-₹{suggestion.cost_breakdown.worker_cost.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Transportation cost</span>
                <span className="font-medium text-slate-900">-₹{suggestion.cost_breakdown.transportation_cost.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Miscellaneous cost</span>
                <span className="font-medium text-slate-900">-₹{suggestion.cost_breakdown.misc_cost.toLocaleString("en-IN")}</span>
              </div>
              {suggestion.payment_fraction < 1 && (
                <div className="flex justify-between text-xs text-amber-600">
                  <span>Only {Math.round(suggestion.payment_fraction * 100)}% of this bill is paid, so costs above are scaled to match</span>
                  <span>×{suggestion.payment_fraction.toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                <span>Suggested profit</span>
                <span>₹{suggestion.suggested_profit.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {suggestion.lines.some((l) => !l.cost_known) && (
              <p className="mt-3 text-xs text-amber-600">
                Some items on this bill aren't linked to inventory, so their material cost isn't known — they're
                counted as full profit. Link them to inventory next time for a more accurate figure.
              </p>
            )}

            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={useOverride} onChange={(e) => setUseOverride(e.target.checked)} />
                Enter a different profit amount instead
              </label>
              {useOverride && (
                <input
                  type="number"
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  placeholder={`e.g. ${suggestion.suggested_profit}`}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              )}
            </div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-rose-500">Could not load profit preview.</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming || loading || !suggestion}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {confirming ? "Confirming…" : "Confirm Profit"}
          </button>
        </div>
      </div>
    </div>
  );
}
