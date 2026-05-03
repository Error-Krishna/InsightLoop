import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import Card from "../../components/Card";
import MetricCard from "../../components/MetricCard";
import api from "../../lib/api";
import { getCompanyId } from "../../lib/auth";

export default function DashboardPage() {
  const [data, setData] = useState({
    summary: null,
    revExp: { labels: [], revenue: [], expenses: [] },
    profitTrends: { labels: [], profit: [] },
    workers: [],
    topWorkers: [],
    billsCount: 0,
  });

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
      } catch (error) {
        toast.error("Failed to load dashboard data");
      }
    }

    function connectSocket() {
      const companyId = getCompanyId();
      if (!companyId) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/ws/dashboard/${companyId}/`);
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setData((current) => ({
            ...current,
            summary: payload.summary || current.summary,
            revExp: payload.revExp || current.revExp,
            profitTrends: payload.profitTrends || current.profitTrends,
            workers: payload.workers?.workers || payload.workers || current.workers,
            topWorkers: payload.topWorkers?.workers || payload.topWorkers || current.topWorkers,
          }));
        } catch {
          toast.error("Dashboard stream error");
        }
      };
    }

    bootstrap();
    connectSocket();
    return () => socket?.close();
  }, []);

  const revenueSeries = useMemo(
    () => data.revExp.labels.map((label, index) => ({ label, revenue: data.revExp.revenue[index], expenses: data.revExp.expenses[index] })),
    [data.revExp],
  );
  const profitSeries = useMemo(
    () => data.profitTrends.labels.map((label, index) => ({ label, value: data.profitTrends.profit[index] })),
    [data.profitTrends],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <MetricCard title="Total Revenue" value={`₹${Number(data.summary?.total_revenue || 0).toLocaleString()}`} trend={data.summary?.revenue_change} data={profitSeries} />
        <MetricCard title="Total Profit" value={`₹${Number(data.summary?.total_profit || 0).toLocaleString()}`} trend={data.summary?.profit_change} data={profitSeries} color="#14b8a6" />
        <MetricCard title="Active Workers" value={Number(data.summary?.active_workers || 0).toLocaleString()} trend={data.summary?.workers_change} data={data.workers.map((worker, index) => ({ value: worker.amount || worker.pending_amount || index + 1 }))} color="#8b5cf6" />
        <MetricCard title="Bills This Month" value={Number(data.billsCount || 0).toLocaleString()} trend={12.4} data={revenueSeries.map((item) => ({ value: item.revenue || 0 }))} color="#f59e0b" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">Revenue vs Expenses</h2>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} />
                <Line type="monotone" dataKey="expenses" stroke="#f97316" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">Profit Trends</h2>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={profitSeries}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#14b8a6" fill="#99f6e4" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Worker Payments</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  {["Worker", "Month", "Amount", "Status"].map((column) => (
                    <th key={column} className="px-6 py-3 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.workers.map((worker, index) => (
                  <tr key={`${worker.name}-${index}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">{worker.name}</td>
                    <td className="px-6 py-4 text-slate-600">{worker.month}</td>
                    <td className="px-6 py-4 text-slate-600">₹{Number(worker.amount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${worker.status === "Paid" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                        {worker.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">Top Workers by Payout</h2>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topWorkers} layout="vertical">
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip />
                <Bar dataKey="total_payout" fill="#2563eb" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
