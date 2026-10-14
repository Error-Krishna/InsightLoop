import { Line, LineChart, ResponsiveContainer } from "recharts";
import Card from "./Card";

export default function MetricCard({ title, value, trend, data = [], color = "#2563eb" }) {
  const positive = Number(trend || 0) >= 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
          <span
            className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              positive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            }`}
          >
            {positive ? "▲" : "▼"} {Math.abs(Number(trend || 0)).toFixed(1)}%
          </span>
        </div>
        <div className="h-16 w-28">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <Line dataKey="value" stroke={color} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
