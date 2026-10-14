import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, FileText, CheckCircle, PackagePlus, X } from "lucide-react";
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
  const [quickAddIndex, setQuickAddIndex] = useState<number | null>(null);
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
      const [finished, semiFinished, raw] = await Promise.all([
        api.get<InventoryItemRef[]>("/inventory/finished/"),
        api.get<InventoryItemRef[]>("/inventory/semi-finished/"),
        api.get<InventoryItemRef[]>("/inventory/raw/"),
      ]);
      setInventoryItems([...finished.data, ...semiFinished.data, ...raw.data]);
    } catch {
      // non-blocking -- billing must still work even if inventory can't load
    }
  }

  useEffect(() => {
    loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billType]);

  function updateProduct(index: number, field: keyof BillItem, value: any) {
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
              inventory_item_id: item.id,
            }
          : p,
      ),
    }));
  }

  function clearInventoryLink(index: number) {
    setForm((c) => ({
      ...c,
      products: c.products.map((p, i) => (i === index ? { ...p, inventory_item_id: null } : p)),
    }));
  }

  function matchingInventoryItem(name: string): InventoryItemRef | null {
    const trimmed = (name || "").trim().toLowerCase();
    if (!trimmed) return null;
    return inventoryItems.find((item) => item.name.trim().toLowerCase() === trimmed) || null;
  }

  function handleItemAdded(index: number, item: InventoryItemRef) {
    setInventoryItems((c) => [...c, item]);
    selectInventoryItem(index, item);
    setQuickAddIndex(null);
    toast.success(`${item.name} added to inventory`);
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
        buyer_phone: "",
        gst_number: "",
        gst_percentage: isPakka ? 18 : 0,
        discount: 0,
        products: [{ ...emptyProduct }],
      });
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to save bill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
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
                  <label className="mb-1 block text-sm font-medium text-slate-700">GST Rate</label>
                  <select
                    value={form.gst_percentage}
                    onChange={(e) => setForm((c) => ({ ...c, gst_percentage: Number(e.target.value) }))}
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
              value={String(form.discount)}
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
              {form.products.map((product, i) => {
                const linkedItem = product.inventory_item_id
                  ? inventoryItems.find((item) => item.id === product.inventory_item_id)
                  : null;
                const matched = matchingInventoryItem(product.name);
                const showAddToInventory =
                  !product.inventory_item_id && product.name.trim() && !matched;
                return (
                  <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="grid gap-2 lg:grid-cols-[2fr_1fr_1fr_80px_36px]">
                      <ProductNameField
                        value={product.name}
                        inventoryItems={inventoryItems}
                        onChange={(v) => {
                          updateProduct(i, "name", v);
                          if (product.inventory_item_id) clearInventoryLink(i);
                        }}
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
                        className="flex items-center justify-center rounded-lg border border-rose-200 p-2 text-rose-400 transition hover:bg-rose-50 lg:mt-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {linkedItem && (
                      <p className="mt-2 px-1 text-xs text-emerald-600">
                        Linked to inventory · {linkedItem.quantity} {linkedItem.unit} in stock
                      </p>
                    )}

                    {showAddToInventory && (
                      <button
                        type="button"
                        onClick={() => setQuickAddIndex(i)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
                      >
                        <PackagePlus className="h-3.5 w-3.5" />
                        Add "{product.name.trim()}" to inventory
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Live preview */}
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
        </div>
      </div>

      <BillManager billType={billType} refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />

      {quickAddIndex !== null && (
        <QuickAddInventoryModal
          initialName={form.products[quickAddIndex]?.name.trim() || ""}
          initialQuantity={form.products[quickAddIndex]?.quantity || 0}
          onClose={() => setQuickAddIndex(null)}
          onAdded={(item) => handleItemAdded(quickAddIndex, item)}
        />
      )}
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
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      {showDropdown && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={() => onSelectItem(item)}
              className="flex w-full items-center justify-between px-3.5 py-2 text-left text-sm transition hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">{item.name}</span>
              <span className="text-xs text-slate-400">
                {item.quantity} {item.unit} · ₹{item.selling_price}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface QuickAddInventoryModalProps {
  initialName: string;
  initialQuantity?: number;
  onClose: () => void;
  onAdded: (item: InventoryItemRef) => void;
}

function QuickAddInventoryModal({ initialName, initialQuantity = 0, onClose, onAdded }: QuickAddInventoryModalProps) {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState("pcs");
  const [sellingPrice, setSellingPrice] = useState<number | string>(0);
  const [quantity, setQuantity] = useState<number | string>(initialQuantity);
  const [itemType, setItemType] = useState("finished");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Item name is required");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<InventoryItemRef>(`/inventory/${itemType}/`, {
        name: name.trim(),
        unit,
        selling_price: Number(sellingPrice) || 0,
        quantity: Number(quantity) || 0,
      });
      onAdded(data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to add item to inventory");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Add to inventory</h3>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <FieldInput label="Item name" value={name} onChange={setName} placeholder="Jute bag - large" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="finished">Finished good</option>
                <option value="semi-finished">Work in progress</option>
                <option value="raw">Raw material</option>
              </select>
            </div>
            <FieldInput label="Unit" value={unit} onChange={setUnit} placeholder="pcs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput
              label="Selling price (₹)"
              type="number"
              value={String(sellingPrice)}
              onChange={setSellingPrice}
              placeholder="0.00"
            />
            <FieldInput
              label="Opening stock"
              type="number"
              value={String(quantity)}
              onChange={setQuantity}
              placeholder="0"
            />
          </div>
          {Number(initialQuantity) > 0 && (
            <p className="-mt-1 text-xs text-slate-400">
              Pre-filled with the {initialQuantity} you're billing — adjust if your real stock is different.
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {saving ? "Adding…" : "Add item"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-300">
      <span>{label}</span>
      <span>₹{Number(value || 0).toFixed(2)}</span>
    </div>
  );
}
