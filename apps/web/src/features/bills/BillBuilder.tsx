import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FileText, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";
import BillManager from "./BillManager";
import type { BillItem, InventoryItemRef } from "./types";

interface BillBuilderProps {
  billType: "kacha" | "pakka";
}

interface BillFormData {
  buyer_name: string;
  buyer_address: string;
  buyer_phone: string;
  gst_number: string;
  gst_percentage: number;
  discount: number | string;
  products: BillItem[];
}

const emptyProduct: BillItem = { name: "", quantity: 1, rate: 0, unit: "pcs", inventory_item_id: null };

const GST_RATES = [0, 5, 12, 18, 28];

export default function BillBuilder({ billType }: BillBuilderProps) {
  const isPakka = billType === "pakka";
  const [form, setForm] = useState<BillFormData>({
    buyer_name: "",
    buyer_address: "",
    buyer_phone: "",
    gst_number: "",
    gst_percentage: isPakka ? 18 : 0,
    discount: 0,
    products: [{ ...emptyProduct }],
  });
  const [saving, setSaving] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRef[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const subtotal = useMemo(
    () => form.products.reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.rate || 0), 0),
    [form.products],
  );
  const discount = Number(form.discount || 0);
  const taxable = Math.max(subtotal - discount, 0);
  const gstAmount = isPakka ? (taxable * Number(form.gst_percentage || 0)) / 100 : 0;
  const grandTotal = taxable + gstAmount;

  async function loadInventory() {
    try {
      const [finished, raw] = await Promise.all([
        api.get<InventoryItemRef[]>("/inventory/finished/"),
        api.get<InventoryItemRef[]>("/inventory/raw/"),
      ]);
      setInventoryItems([...finished.data, ...raw.data]);
    } catch {
      // non-blocking -- billing must still work even if inventory can't load
    }
  }

  useEffect(() => {
    void loadInventory();
  }, [billType]);

  function updateProduct(index: number, field: keyof BillItem, value: BillItem[keyof BillItem]) {
    setForm((c) => ({
      ...c,
      products: c.products.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  }

  function selectInventoryItem(index: number, item: InventoryItemRef) {
    setForm((c) => ({
      ...c,
      products: c.products.map((p, i) =>
        i === index
          ? {
              ...p,
              name: item.name,
              rate: item.selling_price ?? p.rate,
              unit: item.unit || p.unit,
              inventory_item_id: null,
            }
          : p,
      ),
    }));
  }

  function addProduct() {
    setForm((c) => ({ ...c, products: [...c.products, { ...emptyProduct }] }));
  }

  function removeProduct(index: number) {
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
    const validProducts = form.products.filter((p) => p.name.trim());
    if (validProducts.length === 0) {
      toast.error("Add at least one product");
      return;
    }

    // Duplicate product name validation (case-insensitive, trimmed)
    const productNames = validProducts.map((p) => p.name.trim().toLowerCase());
    if (new Set(productNames).size !== productNames.length) {
      toast.error("Duplicate product names inside the same bill are not allowed");
      return;
    }

    setSaving(true);
    try {
      await api.post(`/bills/${billType}/`, {
        ...form,
        workflow: "order_first",
        products: validProducts.map((p) => ({
          ...p,
          quantity: Number(p.quantity) || 1,
          rate: Number(p.rate) || 0,
          inventory_item_id: null,
        })),
      });
      toast.success("Order confirmed; inventory will not move until raw materials are assigned.");
      setForm({
        buyer_name: "",
        buyer_address: "",
        buyer_phone: "",
        gst_number: "",
        gst_percentage: isPakka ? 18 : 0,
        discount: 0,
        products: [{ ...emptyProduct }],
      });
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to save bill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {/* Builder */}
        <Card className="p-6">
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs font-medium text-indigo-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4F6BF5]" />
            <div>
              <strong className="font-semibold text-indigo-900">Make-to-order workflow:</strong> Creating this bill confirms the order. Inventory will not move until raw materials are assigned to workers.
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {isPakka ? "Pakka" : "Kacha"} Bill
              </h2>
              <p className="text-xs font-medium text-slate-400">
                {isPakka ? "GST-compliant invoice" : "Informal invoice"}
              </p>
            </div>
            <button
              type="button"
              onClick={saveBill}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#4F6BF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition-all hover:bg-[#435CE6] disabled:opacity-60"
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
            <FieldInput
              label="Buyer Phone (for WhatsApp)"
              value={form.buyer_phone}
              onChange={(v) => setForm((c) => ({ ...c, buyer_phone: v }))}
              placeholder="9876543210"
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
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    <span>GST Rate</span>
                    <select
                      value={form.gst_percentage}
                      onChange={(e) => setForm((c) => ({ ...c, gst_percentage: Number(e.target.value) }))}
                      className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
                    >
                      {GST_RATES.map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
            <FieldInput
              label="Discount (₹)"
              type="number"
              value={String(form.discount)}
              onChange={(v) => setForm((c) => ({ ...c, discount: v }))}
              placeholder="0"
            />
          </div>

          {/* Products */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Products</h3>
              <button
                type="button"
                onClick={addProduct}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5 text-[#4F6BF5]" />
                Add Row
              </button>
            </div>

            {/* Header */}
            <div className="mb-2 hidden grid-cols-[2fr_1fr_1fr_80px_36px] gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400 lg:grid">
              <span>Product</span>
              <span>Qty</span>
              <span>Rate (₹)</span>
              <span>Unit</span>
              <span />
            </div>

            <div className="space-y-2.5">
              {form.products.map((product, i) => (
                <div key={i} className="rounded-2xl border border-slate-100 bg-[#f8fafc] p-3 transition-colors hover:border-slate-200">
                  <div className="grid gap-2 lg:grid-cols-[2fr_1fr_1fr_80px_36px]">
                    <ProductNameField
                      value={product.name}
                      inventoryItems={inventoryItems}
                      onChange={(v) => updateProduct(i, "name", v)}
                      onSelectItem={(item) => selectInventoryItem(i, item)}
                    />
                    <FieldInput
                      label="Qty"
                      hideLabel
                      type="number"
                      value={String(product.quantity)}
                      onChange={(v) => updateProduct(i, "quantity", Number(v) || 0)}
                      placeholder="1"
                    />
                    <FieldInput
                      label="Rate"
                      hideLabel
                      type="number"
                      value={String(product.rate)}
                      onChange={(v) => updateProduct(i, "rate", Number(v) || 0)}
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
                      className="flex items-center justify-center rounded-xl border border-rose-150 bg-white p-2 text-rose-500 shadow-2xs transition hover:bg-rose-50 lg:mt-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Live preview */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#4F6BF5]">
                <FileText className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold tracking-tight text-slate-900">Live Preview</h2>
            </div>

            <div className="space-y-4 text-sm">
              {/* Buyer block */}
              <div className="rounded-2xl border border-slate-100 bg-[#f4f7fb] p-4">
                <p className="font-semibold text-slate-900">{form.buyer_name || "Buyer name"}</p>
                <p className="mt-0.5 text-xs text-slate-500 font-medium">{form.buyer_address || "Address will appear here"}</p>
                {isPakka && form.gst_number && (
                  <p className="mt-1 text-xs font-semibold text-indigo-600">GST: {form.gst_number}</p>
                )}
              </div>

              {/* Line items */}
              <div className="space-y-2">
                {form.products.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100/90 bg-white px-4 py-2.5 shadow-2xs">
                    <div>
                      <p className="font-semibold text-slate-900">{p.name || `Item ${i + 1}`}</p>
                      <p className="text-xs text-slate-400">
                        {p.quantity} {p.unit} × ₹{p.rate}
                      </p>
                    </div>
                    <p className="font-bold text-slate-900">
                      ₹{(Number(p.quantity || 0) * Number(p.rate || 0)).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-2 rounded-2xl bg-slate-900 p-5 text-white shadow-md">
                <SummaryRow label="Subtotal" value={subtotal} />
                {discount > 0 && <SummaryRow label="Discount" value={discount} />}
                {isPakka && <SummaryRow label={`GST (${form.gst_percentage}%)`} value={gstAmount} />}
                <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-3 font-bold">
                  <span className="text-slate-200">Grand Total</span>
                  <span className="text-xl text-white">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <BillManager billType={billType} refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />
    </div>
  );
}

interface FieldInputProps {
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}

function FieldInput({ label, hideLabel = false, value, onChange, type = "text", placeholder }: FieldInputProps) {
  return (
    <div>
      {!hideLabel && <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
      />
    </div>
  );
}

interface ProductNameFieldProps {
  value: string;
  inventoryItems: InventoryItemRef[];
  onChange: (value: string) => void;
  onSelectItem: (item: InventoryItemRef) => void;
}

function ProductNameField({ value, inventoryItems, onChange, onSelectItem }: ProductNameFieldProps) {
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return [];
    return inventoryItems
      .filter((item) => item.name.toLowerCase().includes(trimmed))
      .slice(0, 6);
  }, [value, inventoryItems]);

  const showDropdown = focused && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        placeholder="Product name"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
      />
      {showDropdown && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={() => onSelectItem(item)}
              className="flex w-full items-center justify-between px-3.5 py-2 text-left text-sm transition hover:bg-slate-50"
            >
              <span className="font-semibold text-slate-800">{item.name}</span>
              <span className="text-xs text-slate-400 font-medium">
                {item.quantity} {item.unit} · ₹{item.selling_price}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-300">
      <span>{label}</span>
      <span className="font-medium text-white">₹{Number(value || 0).toFixed(2)}</span>
    </div>
  );
}
