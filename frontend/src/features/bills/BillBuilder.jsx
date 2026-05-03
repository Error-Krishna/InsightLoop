import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

const emptyProduct = { name: "", quantity: 1, rate: 0, unit: "pcs" };

export default function BillBuilder({ billType }) {
  const [form, setForm] = useState({
    buyer_name: "",
    buyer_address: "",
    gst_number: "",
    gst_percentage: billType === "pakka" ? 18 : 0,
    discount: 0,
    products: [emptyProduct],
  });
  const [recentBills, setRecentBills] = useState([]);

  const subtotal = useMemo(
    () => form.products.reduce((sum, product) => sum + Number(product.quantity || 0) * Number(product.rate || 0), 0),
    [form.products],
  );
  const taxable = Math.max(subtotal - Number(form.discount || 0), 0);
  const gstAmount = billType === "pakka" ? (taxable * Number(form.gst_percentage || 0)) / 100 : 0;
  const grandTotal = taxable + gstAmount;

  async function loadBills() {
    const { data } = await api.get(`/bills/?type=${billType}`);
    setRecentBills(data);
  }

  useEffect(() => {
    loadBills().catch(() => toast.error("Failed to load bills"));
  }, [billType]);

  function updateProduct(index, field, value) {
    setForm((current) => ({
      ...current,
      products: current.products.map((product, productIndex) => (productIndex === index ? { ...product, [field]: value } : product)),
    }));
  }

  async function saveBill() {
    try {
      await api.post(`/bills/${billType}/`, form);
      toast.success(`${billType === "kacha" ? "Kacha" : "Pakka"} bill saved`);
      setForm({
        buyer_name: "",
        buyer_address: "",
        gst_number: "",
        gst_percentage: billType === "pakka" ? 18 : 0,
        discount: 0,
        products: [emptyProduct],
      });
      loadBills();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save bill");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{billType === "kacha" ? "Kacha" : "Pakka"} Bill</h2>
            <p className="text-sm text-slate-500">Create invoices with live totals and instant previews.</p>
          </div>
          <button type="button" onClick={saveBill} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            Save Bill
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Buyer Name" value={form.buyer_name} onChange={(value) => setForm((current) => ({ ...current, buyer_name: value }))} />
          <Input label="Buyer Address" value={form.buyer_address} onChange={(value) => setForm((current) => ({ ...current, buyer_address: value }))} />
          {billType === "pakka" && (
            <>
              <Input label="GST Number" value={form.gst_number} onChange={(value) => setForm((current) => ({ ...current, gst_number: value }))} />
              <label className="text-sm font-medium text-slate-700">
                GST Rate
                <select
                  value={form.gst_percentage}
                  onChange={(event) => setForm((current) => ({ ...current, gst_percentage: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3"
                >
                  {[0, 5, 12, 18, 28].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}%
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <Input label="Discount" type="number" value={form.discount} onChange={(value) => setForm((current) => ({ ...current, discount: value }))} />
        </div>

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Products</h3>
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, products: [...current.products, { ...emptyProduct }] }))}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          </div>

          <div className="space-y-3">
            {form.products.map((product, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 lg:grid-cols-[2fr_1fr_1fr_80px_48px]">
                <Input label="Product" value={product.name} onChange={(value) => updateProduct(index, "name", value)} />
                <Input label="Qty" type="number" value={product.quantity} onChange={(value) => updateProduct(index, "quantity", value)} />
                <Input label="Rate" type="number" value={product.rate} onChange={(value) => updateProduct(index, "rate", value)} />
                <Input label="Unit" value={product.unit} onChange={(value) => updateProduct(index, "unit", value)} />
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => {
                      const nextProducts = current.products.filter((_, productIndex) => productIndex !== index);
                      return { ...current, products: nextProducts.length ? nextProducts : [{ ...emptyProduct }] };
                    })
                  }
                  className="mt-6 rounded-lg border border-rose-200 text-rose-500"
                >
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-slate-900">Live Preview</h2>
          <div className="mt-6 space-y-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{form.buyer_name || "Buyer name"}</p>
              <p className="text-slate-500">{form.buyer_address || "Address will appear here"}</p>
              {billType === "pakka" && <p className="mt-2 text-slate-600">GST: {form.gst_number || "-"}</p>}
            </div>
            <div className="space-y-2">
              {form.products.map((product, index) => (
                <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{product.name || `Item ${index + 1}`}</p>
                    <p className="text-xs text-slate-500">
                      {product.quantity} {product.unit} x ₹{product.rate}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">₹{(Number(product.quantity || 0) * Number(product.rate || 0)).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 rounded-xl bg-slate-900 p-4 text-white">
              <SummaryRow label="Subtotal" value={subtotal} />
              <SummaryRow label="Discount" value={Number(form.discount || 0)} />
              {billType === "pakka" && <SummaryRow label={`GST (${form.gst_percentage}%)`} value={gstAmount} />}
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-base font-semibold">
                <span>Grand Total</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Recent Bills</h2>
          </div>
          <div className="space-y-3 p-4">
            {recentBills.slice(0, 6).map((bill) => (
              <div key={bill.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{bill.invoice_number}</p>
                    <p className="text-sm text-slate-500">{bill.buyer?.name}</p>
                  </div>
                  <p className="font-semibold text-slate-900">₹{Number(bill.grand_total || 0).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3" />
    </label>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-200">
      <span>{label}</span>
      <span>₹{Number(value || 0).toFixed(2)}</span>
    </div>
  );
}
