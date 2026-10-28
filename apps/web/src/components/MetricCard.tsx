import React from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import Card from "./Card";

export interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: number | string;
  data?: { value: number; [key: string]: unknown }[];
  color?: string;
  icon?: React.ReactNode;
}

export default function MetricCard({
  title,
  value,
  trend,
  data = [],
  color = "#4f6bf5",
  icon,
}: MetricCardProps) {
  const positive = Number(trend || 0) >= 0;

  return (
    <Card className="p-5 transition-shadow hover:shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {icon ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400">
            {icon}
          </div>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400/80" />
          </div>
        )}
      </div>

      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{value}</p>

      <div className="mt-4 flex items-end justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
            positive
              ? "bg-emerald-50 text-emerald-600 border border-emerald-100/60"
              : "bg-rose-50 text-rose-600 border border-rose-100/60"
          }`}
        >
          {positive ? "▲" : "▼"} {Math.abs(Number(trend || 0)).toFixed(1)}%
        </span>

        <div className="h-10 w-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
