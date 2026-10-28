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
import { Activity, IndianRupee, ReceiptText, Users } from "lucide-react";
import { buildWsUrl } from "../../lib/ws";
import Card from "../../components/Card";
import MetricCard from "../../components/MetricCard";
import api from "../../lib/api";
import { getAccessToken, getCompanyId } from "../../lib/auth";

interface SummaryData {
  total_revenue?: number;
  total_profit?: number;
  active_workers?: number;
  revenue_change?: number;
  profit_change?: number;
  workers_change?: number;
  [key: string]: unknown;
}

interface RevExpData {
  labels: string[];
  revenue: number[];
  expenses: number[];
}

interface ProfitTrendsData {
  labels: string[];
  profit: number[];
}

interface WorkerPaymentItem {
  name: string;
  month: string;
  amount: number;
  status: string;
}

interface TopWorkerItem {
  name: string;
  total_payout: number;
  units_produced?: number;
}

interface DashboardState {
  summary: SummaryData | null;
  revExp: RevExpData;
  profitTrends: ProfitTrendsData;
  workers: WorkerPaymentItem[];
  topWorkers: TopWorkerItem[];
  billsCount: number;
}

const EMPTY_DATA: DashboardState = {
  summary: null,
  revExp: { labels: [], revenue: [], expenses: [] },
  profitTrends: { labels: [], profit: [] },
  workers: [],
  topWorkers: [],
  billsCount: 0,
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm font-medium text-slate-400">
      {message}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPaid = status === "Paid";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold ${
        isPaid
          ? "border border-emerald-150 bg-emerald-50 text-emerald-600"
          : "border border-amber-150 bg-amber-50 text-amber-600"
      }`}
    >
      {status}
    </span>
  );
}

const customTooltipStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "14px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.08)",
  padding: "8px 12px",
  fontSize: "12px",
  fontWeight: "500",
  color: "#0f172a",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardState>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let socket: WebSocket | undefined;

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

    void bootstrap();
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
          color="#4F6BF5"
          icon={<IndianRupee className="h-4 w-4 text-[#4F6BF5]" />}
        />
        <MetricCard
          title="Total Profit"
          value={`₹${Number(data.summary?.total_profit || 0).toLocaleString("en-IN")}`}
          trend={data.summary?.profit_change}
          data={profitSeries}
          color="#10B981"
          icon={<Activity className="h-4 w-4 text-emerald-500" />}
        />
        <MetricCard
          title="Active Workers"
          value={Number(data.summary?.active_workers || 0).toLocaleString()}
          trend={data.summary?.workers_change}
          data={data.workers.map((w, i) => ({ value: w.amount || i + 1 }))}
          color="#8B5CF6"
          icon={<Users className="h-4 w-4 text-purple-500" />}
        />
        <MetricCard
          title="Bills This Month"
          value={Number(data.billsCount || 0).toLocaleString()}
          trend={12.4}
          data={revenueSeries.map((r) => ({ value: r.revenue || 0 }))}
          color="#F59E0B"
          icon={<ReceiptText className="h-4 w-4 text-amber-500" />}
        />
      </div>

      {/* Charts grid */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Revenue vs Expenses */}
        <Card className="p-6">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Revenue vs Expenses</h2>
              <p className="text-xs font-medium text-slate-400">Monthly comparison over last 6 months</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#4F6BF5]" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FB923C]" /> Expenses
              </span>
            </div>
          </div>
          {revenueSeries.length === 0 ? (
            <EmptyState message="No revenue data yet. Upload sales data to see charts." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueSeries}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    formatter={(v: unknown) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#4F6BF5"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="#FB923C"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Profit Trends */}
        <Card className="p-6">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Profit Trends</h2>
              <p className="text-xs font-medium text-slate-400">Net profit over time</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Net Profit
            </div>
          </div>
          {profitSeries.length === 0 ? (
            <EmptyState message="No profit data available yet." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profitSeries}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    formatter={(v: unknown) => [`₹${Number(v).toLocaleString("en-IN")}`, "Profit"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#10B981"
                    fill="url(#profitGrad)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Worker Payments Table */}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Worker Payments</h2>
            <p className="text-xs font-medium text-slate-400">Recent payment records</p>
          </div>
          {data.workers.length === 0 ? (
            <EmptyState message="No worker payment records found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    {["Worker", "Month", "Amount", "Status"].map((col) => (
                      <th
                        key={col}
                        className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-400"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {data.workers.map((worker, i) => (
                    <tr
                      key={`${worker.name}-${i}`}
                      className="transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-6 py-4 font-semibold text-slate-900">{worker.name}</td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{worker.month}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        ₹{Number(worker.amount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-4">
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
          <div className="mb-6">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Top Workers by Payout</h2>
            <p className="text-xs font-medium text-slate-400">Highest-paid workers overall</p>
          </div>
          {data.topWorkers.length === 0 ? (
            <EmptyState message="No worker payout data available." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topWorkers} layout="vertical">
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={110}
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    formatter={(v: unknown) => [`₹${Number(v).toLocaleString("en-IN")}`, "Payout"]}
                  />
                  <Bar
                    dataKey="total_payout"
                    fill="#4F6BF5"
                    radius={[0, 8, 8, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
