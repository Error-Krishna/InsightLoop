import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FileText, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

const emptyProduct = { name: "", quantity: 1, rate: 0, unit: "pcs" };

const GST_RATES = [0, 5, 12, 18, 28];

export default function BillBuilder({ billType }) {
  const isPakka = billType === "pakka";
  const [form, setForm] = useState({
    buyer_name: "",
    buyer_address: "",
    gst_number: "",
    gst_percentage: isPakka ? 18 : 0,
    discount: 0,
    products: [{ ...emptyProduct }],
  });
  const [recentBills, setRecentBills] = useState([]);
  const [saving, setSaving] = useState(false);

  const subtotal = useMemo(
    () => form.products.reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.rate || 0), 0),
    [form.products],
  );
  const discount = Number(form.discount || 0);
  const taxable = Math.max(subtotal - discount, 0);
  const gstAmount = isPakka ? (taxable * Number(form.gst_percentage || 0)) / 100 : 0;
  const grandTotal = taxable + gstAmount;

  async function loadBills() {
    try {
      const { data } = await api.get(`/bills/?type=${billType}`);
      setRecentBills(data);
    } catch {
      // non-blocking
    }
  }

  useEffect(() => {
    loadBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billType]);

  function updateProduct(index, field, value) {
    setForm((c) => ({
      ...c,
      products: c.products.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  }

  function addProduct() {
    setForm((c) => ({ ...c, products: [...c.products, { ...emptyProduct }] }));
  }

  function removeProduct(index) {
    setForm((c) => {
      const next = c.products.filter((_, i) => i !== index);
      return { ...c, products: next.length ? next : [{ ...emptyProduct }] };
    });
  }

  async function saveBill() {
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
      await api.post(`/bills/${billType}/`, form);
      toast.success(`${isPakka ? "Pakka" : "Kacha"} bill saved successfully`);
      setForm({
        buyer_name: "",
        buyer_address: "",
        gst_number: "",
        gst_percentage: isPakka ? 18 : 0,
        discount: 0,
        products: [{ ...emptyProduct }],
      });
      loadBills();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save bill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      {/* Builder */}
      <Card className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isPakka ? "Pakka" : "Kacha"} Bill
            </h2>
            <p className="text-sm text-slate-400">
              {isPakka ? "GST-compliant invoice" : "Informal invoice"}
            </p>
          </div>
          <button
            type="button"
            onClick={saveBill}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            <CheckCircle className="h-4 w-4" />
            {saving ? "Saving…" : "Save Bill"}
          </button>
        </div>

        {/* Buyer info */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldInput
            label="Buyer Name *"
            value={form.buyer_name}
            onChange={(v) => setForm((c) => ({ ...c, buyer_name: v }))}
            placeholder="Ramesh Traders"
          />
          <FieldInput
            label="Buyer Address"
            value={form.buyer_address}
            onChange={(v) => setForm((c) => ({ ...c, buyer_address: v }))}
            placeholder="123 Main St, City"
          />
          {isPakka && (
            <>
              <FieldInput
                label="GST Number"
                value={form.gst_number}
                onChange={(v) => setForm((c) => ({ ...c, gst_number: v }))}
                placeholder="22AAAAA0000A1Z5"
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">GST Rate</label>
                <select
                  value={form.gst_percentage}
                  onChange={(e) => setForm((c) => ({ ...c, gst_percentage: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <FieldInput
            label="Discount (₹)"
            type="number"
            value={form.discount}
            onChange={(v) => setForm((c) => ({ ...c, discount: v }))}
            placeholder="0"
          />
        </div>

        {/* Products */}
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Products</h3>
            <button
              type="button"
              onClick={addProduct}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </button>
          </div>

          {/* Header */}
          <div className="mb-2 hidden grid-cols-[2fr_1fr_1fr_80px_36px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-400 lg:grid">
            <span>Product</span>
            <span>Qty</span>
            <span>Rate (₹)</span>
            <span>Unit</span>
            <span />
          </div>

          <div className="space-y-2">
            {form.products.map((product, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[2fr_1fr_1fr_80px_36px]"
              >
                <FieldInput
                  label="Product"
                  hideLabel
                  value={product.name}
                  onChange={(v) => updateProduct(i, "name", v)}
                  placeholder="Product name"
                />
                <FieldInput
                  label="Qty"
                  hideLabel
                  type="number"
                  value={product.quantity}
                  onChange={(v) => updateProduct(i, "quantity", v)}
                  placeholder="1"
                />
                <FieldInput
                  label="Rate"
                  hideLabel
                  type="number"
                  value={product.rate}
                  onChange={(v) => updateProduct(i, "rate", v)}
                  placeholder="0.00"
                />
                <FieldInput
                  label="Unit"
                  hideLabel
                  value={product.unit}
                  onChange={(v) => updateProduct(i, "unit", v)}
                  placeholder="pcs"
                />
                <button
                  type="button"
                  onClick={() => removeProduct(i)}
                  className="flex items-center justify-center rounded-lg border border-rose-200 p-2 text-rose-400 transition hover:bg-rose-50 lg:mt-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Preview + recent */}
      <div className="space-y-6">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900">Live Preview</h2>
          </div>

          <div className="space-y-4 text-sm">
            {/* Buyer block */}
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{form.buyer_name || "Buyer name"}</p>
              <p className="mt-0.5 text-xs text-slate-500">{form.buyer_address || "Address will appear here"}</p>
              {isPakka && form.gst_number && (
                <p className="mt-1 text-xs text-slate-500">GST: {form.gst_number}</p>
              )}
            </div>

            {/* Line items */}
            <div className="space-y-1.5">
              {form.products.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-2.5">
                  <div>
                    <p className="font-medium text-slate-900">{p.name || `Item ${i + 1}`}</p>
                    <p className="text-xs text-slate-400">
                      {p.quantity} {p.unit} × ₹{p.rate}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">
                    ₹{(Number(p.quantity || 0) * Number(p.rate || 0)).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1.5 rounded-xl bg-slate-900 p-4 text-white">
              <SummaryRow label="Subtotal" value={subtotal} />
              {discount > 0 && <SummaryRow label="Discount" value={discount} />}
              {isPakka && <SummaryRow label={`GST (${form.gst_percentage}%)`} value={gstAmount} />}
              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2.5 font-semibold">
                <span>Grand Total</span>
                <span className="text-lg">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Recent bills */}
        {recentBills.length > 0 && (
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-slate-900">Recent Bills</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {recentBills.slice(0, 6).map((bill) => (
                <div key={bill.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{bill.invoice_number}</p>
                    <p className="text-xs text-slate-400">{bill.buyer?.name || "—"}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    ₹{Number(bill.grand_total || 0).toLocaleString("en-IN")}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function FieldInput({ label, hideLabel = false, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      {!hideLabel && <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>}
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

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-300">
      <span>{label}</span>
      <span>₹{Number(value || 0).toFixed(2)}</span>
    </div>
  );
}