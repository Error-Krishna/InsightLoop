import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

interface InProductionItem {
  id?: string;
  assignment_id: string;
  worker_id?: string | null;
  worker_name?: string | null;
  bill_id?: string | null;
  invoice_number?: string;
  product_name?: string;
  name?: string;
  unit?: string;
  raw_item_name?: string;
  raw_unit?: string;
  raw_issued?: number;
  raw_returned?: number;
  raw_with_worker?: number;
  target?: number;
  produced?: number;
  remaining_output?: number;
  // Compat fields
  assigned_quantity?: number;
  delivered_quantity?: number;
  balance_quantity?: number;
  location_label?: string;
  order?: {
    bill_id: string;
    invoice_number: string;
    buyer_name?: string;
  } | null;
}

export default function SemiFinishedInventoryPage() {
  const navigate = useNavigate();
  const [inProduction, setInProduction] = useState<InProductionItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadInProduction() {
    setLoading(true);
    try {
      const { data } = await api.get<{ in_production: InProductionItem[] }>("/inventory/semi-finished/live/");
      setInProduction(data.in_production || []);
    } catch {
      toast.error("Failed to load in-production items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInProduction();
  }, []);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-[#4F6BF5]">
            <Package className="h-4 w-4" />
          </div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">
            In Production (derived from open worker assignments, read only)
          </h2>
          <span className="ml-1 rounded-full border border-indigo-150 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-[#4F6BF5]">
            {inProduction.length}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-slate-400">
          Live from open worker assignments — this updates automatically as work is assigned and completed, it isn't
          something you edit here directly.
        </p>

        {loading ? (
          <p className="mt-6 text-sm font-medium text-slate-400 text-center py-8">Loading…</p>
        ) : inProduction.length === 0 ? (
          <p className="mt-6 text-sm font-medium text-slate-400 text-center py-8">Nothing currently in production.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3.5">Worker</th>
                  <th className="px-4 py-3.5">Order</th>
                  <th className="px-4 py-3.5">Product</th>
                  <th className="px-4 py-3.5">Unit</th>
                  <th className="px-4 py-3.5">Raw Material</th>
                  <th className="px-4 py-3.5 text-right">Raw Issued</th>
                  <th className="px-4 py-3.5 text-right">Raw Returned</th>
                  <th className="px-4 py-3.5 text-right">Raw With Worker</th>
                  <th className="px-4 py-3.5 text-right">Target Output</th>
                  <th className="px-4 py-3.5 text-right">Produced</th>
                  <th className="px-4 py-3.5 text-right">Remaining Output</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {inProduction.map((row) => {
                  const billId = row.bill_id || row.order?.bill_id;
                  const invoiceNumber = row.invoice_number || row.order?.invoice_number || "";
                  const productName = row.product_name || row.name || "Unknown";
                  const unit = row.unit || "pcs";
                  const rawItemName = row.raw_item_name || "Raw";
                  const rawUnit = row.raw_unit || "pcs";
                  const rawIssued = row.raw_issued ?? 0;
                  const rawReturned = row.raw_returned ?? 0;
                  const rawWithWorker = row.raw_with_worker ?? 0;
                  const target = row.target ?? row.assigned_quantity ?? 0;
                  const produced = row.produced ?? row.delivered_quantity ?? 0;
                  const remaining = row.remaining_output ?? row.balance_quantity ?? Math.max(0, target - produced);
                  const workerName = row.worker_name || row.location_label || "Unassigned";

                  return (
                    <tr key={row.assignment_id || row.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3.5 font-bold text-slate-900">{workerName}</td>
                      <td className="px-4 py-3.5">
                        {billId && invoiceNumber ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/bills/order/${billId}`)}
                            className="inline-flex items-center rounded-full border border-indigo-150 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-[#4F6BF5] transition hover:bg-indigo-100/80"
                          >
                            Order {invoiceNumber}
                          </button>
                        ) : invoiceNumber ? (
                          <span className="text-slate-600 font-medium">{invoiceNumber}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900">{productName}</td>
                      <td className="px-4 py-3.5 text-slate-500 font-medium">{unit}</td>
                      <td className="px-4 py-3.5 text-slate-700 font-medium">{rawItemName}</td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                        {rawIssued} <span className="text-xs text-slate-400">{rawUnit}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                        {rawReturned} <span className="text-xs text-slate-400">{rawUnit}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-amber-600">
                        {rawWithWorker} <span className="text-xs text-amber-500 font-medium">{rawUnit}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                        {target} <span className="text-xs text-slate-400">{unit}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-emerald-600">
                        {produced} <span className="text-xs text-emerald-500 font-medium">{unit}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-[#4F6BF5]">
                        {remaining} <span className="text-xs text-indigo-400 font-medium">{unit}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
