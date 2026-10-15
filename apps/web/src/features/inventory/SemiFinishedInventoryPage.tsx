import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";
import InventoryItemsPage from "./InventoryItemsPage";

interface InProductionItem {
  id: string;
  name: string;
  location_label?: string;
  assigned_quantity: number;
  delivered_quantity: number;
  balance_quantity: number;
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
          <h2 className="text-base font-semibold text-slate-900">In Production</h2>
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
          <div className="mt-4 space-y-2">
            {inProduction.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <p className="text-sm text-slate-500">{row.location_label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">
                      {row.delivered_quantity} / {row.assigned_quantity} returned
                    </p>
                    <p className="text-xs text-slate-400">{row.balance_quantity} still with worker</p>
                  </div>
                </div>
                {row.order && (
                  <button
                    type="button"
                    onClick={() => navigate(`/bills/order/${row.order!.bill_id}`)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
                  >
                    Order {row.order.invoice_number} · {row.order.buyer_name || "—"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <InventoryItemsPage itemType="semi-finished" title="Manually Tracked Work in Progress" />
    </div>
  );
}
