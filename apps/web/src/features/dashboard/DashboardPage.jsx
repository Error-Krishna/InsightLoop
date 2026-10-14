import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { buildWsUrl } from "../../lib/ws";
import Card from "../../components/Card";
import MetricCard from "../../components/MetricCard";
import api from "../../lib/api";
import { getAccessToken, getCompanyId } from "../../lib/auth";

const EMPTY_DATA = {
  summary: null,
  revExp: { labels: [], revenue: [], expenses: [] },
  profitTrends: { labels: [], profit: [] },
  workers: [],
  topWorkers: [],
  billsCount: 0,
};

function EmptyState({ message }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-slate-400">{message}</div>
  );
}

function StatusBadge({ status }) {
  const isPaid = status === "Paid";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        isPaid ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
      }`}
    >
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let socket;

    async function bootstrap() {
      try {
        const [summary, revExp, profitTrends, workers, topWorkers, bills] = await Promise.all([
          api.get("/dashboard/summary/"),
          api.get("/dashboard/rev-exp/"),
          api.get("/dashboard/profit-trends/"),
          api.get("/dashboard/workers/"),
          api.get("/dashboard/top-workers/"),
          api.get("/bills/"),
        ]);
        setData({
          summary: summary.data,
          revExp: revExp.data,
          profitTrends: profitTrends.data,
          workers: workers.data.workers || [],
          topWorkers: topWorkers.data.workers || [],
          billsCount: (bills.data || []).length,
        });
      } catch {
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    function connectSocket() {
      const companyId = getCompanyId();
      if (!companyId) return;
      const token = getAccessToken();
      const url = buildWsUrl(`/ws/dashboard/${companyId}/?token=${token}`);
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setData((prev) => ({
            ...prev,
            summary: payload.summary ?? prev.summary,
            revExp: payload.revExp ?? prev.revExp,
            profitTrends: payload.profitTrends ?? prev.profitTrends,
            workers: Array.isArray(payload.workers) ? payload.workers : prev.workers,
            topWorkers: Array.isArray(payload.topWorkers) ? payload.topWorkers : prev.topWorkers,
            billsCount: payload.billsCount ?? prev.billsCount,
          }));
        } catch {
          // ignore malformed frames
        }
      };
    }

    bootstrap();
    connectSocket();
    return () => socket?.close();
  }, []);

  const revenueSeries = useMemo(
    () =>
      data.revExp.labels.map((label, i) => ({
        label,
        revenue: data.revExp.revenue[i],
        expenses: data.revExp.expenses[i],
      })),
    [data.revExp],
  );

  const profitSeries = useMemo(
    () => data.profitTrends.labels.map((label, i) => ({ label, value: data.profitTrends.profit[i] })),
    [data.profitTrends],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="h-32 animate-pulse bg-slate-100" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="h-72 animate-pulse bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={`₹${Number(data.summary?.total_revenue || 0).toLocaleString("en-IN")}`}
          trend={data.summary?.revenue_change}
          data={profitSeries}
        />
        <MetricCard
          title="Total Profit"
          value={`₹${Number(data.summary?.total_profit || 0).toLocaleString("en-IN")}`}
          trend={data.summary?.profit_change}
          data={profitSeries}
          color="#14b8a6"
        />
        <MetricCard
          title="Active Workers"
          value={Number(data.summary?.active_workers || 0).toLocaleString()}
          trend={data.summary?.workers_change}
          data={data.workers.map((w, i) => ({ value: w.amount || i + 1 }))}
          color="#8b5cf6"
        />
        <MetricCard
          title="Bills This Month"
          value={Number(data.billsCount || 0).toLocaleString()}
          trend={12.4}
          data={revenueSeries.map((r) => ({ value: r.revenue || 0 }))}
          color="#f59e0b"
        />
      </div>

      {/* Charts grid */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Revenue vs Expenses */}
        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Revenue vs Expenses</h2>
          <p className="mb-6 text-xs text-slate-400">Monthly comparison over last 6 months</p>
          {revenueSeries.length === 0 ? (
            <EmptyState message="No revenue data yet. Upload sales data to see charts." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueSeries}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f97316" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Profit Trends */}
        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Profit Trends</h2>
          <p className="mb-6 text-xs text-slate-400">Net profit over time</p>
          {profitSeries.length === 0 ? (
            <EmptyState message="No profit data available yet." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profitSeries}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Profit"]} />
                  <Area type="monotone" dataKey="value" stroke="#14b8a6" fill="url(#profitGrad)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Worker Payments Table */}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Worker Payments</h2>
            <p className="text-xs text-slate-400">Recent payment records</p>
          </div>
          {data.workers.length === 0 ? (
            <EmptyState message="No worker payment records found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {["Worker", "Month", "Amount", "Status"].map((col) => (
                      <th key={col} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.workers.map((worker, i) => (
                    <tr key={`${worker.name}-${i}`} className="transition hover:bg-slate-50">
                      <td className="px-6 py-3.5 font-medium text-slate-900">{worker.name}</td>
                      <td className="px-6 py-3.5 text-slate-500">{worker.month}</td>
                      <td className="px-6 py-3.5 font-medium text-slate-900">
                        ₹{Number(worker.amount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={worker.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top Workers Bar Chart */}
        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Top Workers by Payout</h2>
          <p className="mb-6 text-xs text-slate-400">Highest-paid workers overall</p>
          {data.topWorkers.length === 0 ? (
            <EmptyState message="No worker payout data available." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topWorkers} layout="vertical">
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Payout"]} />
                  <Bar dataKey="total_payout" fill="#2563eb" radius={[0, 6, 6, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}