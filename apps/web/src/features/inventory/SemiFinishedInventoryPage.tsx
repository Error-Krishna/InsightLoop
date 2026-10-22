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
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">
            In Production (derived from open worker assignments, read only)
          </h2>
          <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">
            {inProduction.length}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Live from open worker assignments — this updates automatically as work is assigned and completed, it isn't
          something you edit here directly.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Loading…</p>
        ) : inProduction.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Nothing currently in production.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-xs font-medium uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Raw Material</th>
                  <th className="px-4 py-3 text-right">Raw Issued</th>
                  <th className="px-4 py-3 text-right">Raw Returned</th>
                  <th className="px-4 py-3 text-right">Raw With Worker</th>
                  <th className="px-4 py-3 text-right">Target Output</th>
                  <th className="px-4 py-3 text-right">Produced</th>
                  <th className="px-4 py-3 text-right">Remaining Output</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                    <tr key={row.assignment_id || row.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{workerName}</td>
                      <td className="px-4 py-3">
                        {billId && invoiceNumber ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/bills/order/${billId}`)}
                            className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50/60 px-2.5 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-100/60"
                          >
                            Order {invoiceNumber}
                          </button>
                        ) : invoiceNumber ? (
                          <span className="text-slate-600">{invoiceNumber}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{productName}</td>
                      <td className="px-4 py-3 text-slate-600">{unit}</td>
                      <td className="px-4 py-3 text-slate-700">{rawItemName}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {rawIssued} <span className="text-xs text-slate-400">{rawUnit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {rawReturned} <span className="text-xs text-slate-400">{rawUnit}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-amber-600">
                        {rawWithWorker} <span className="text-xs text-slate-400">{rawUnit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {target} <span className="text-xs text-slate-400">{unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {produced} <span className="text-xs text-slate-400">{unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600">
                        {remaining} <span className="text-xs text-slate-400">{unit}</span>
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
