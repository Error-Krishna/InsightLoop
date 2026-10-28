import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { Sparkles, Download, Trash2 } from "lucide-react";
import Card from "../../components/Card";
import api from "../../lib/api";

interface InsightItem {
  id: string;
  title: string;
  description: string;
  labels: string[];
  data_points: number[];
  created_at?: string;
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

export default function InsightsPage() {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [selected, setSelected] = useState<InsightItem | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const { data } = await api.get<InsightItem[]>("/insights/");
    setInsights(data);
    setSelected((current) => current || data[0] || null);
  }

  useEffect(() => {
    load().catch(() => toast.error("Failed to load insights"));
  }, []);

  async function generateInsights() {
    setLoading(true);
    try {
      await api.post("/insights/analyze/");
      toast.success("Insights generated");
      await load();
    } catch {
      toast.error("Failed to generate insights");
    } finally {
      setLoading(false);
    }
  }

  async function exportInsight(insight: InsightItem) {
    const response = await api.get(`/insights/${insight.id}/export/`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${insight.title}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Business Insights</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Keep the current sales analysis logic, now in a React experience.
          </p>
        </div>
        <button
          type="button"
          onClick={generateInsights}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#4F6BF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition-all hover:bg-[#435CE6] disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "Generating..." : "Generate Insights"}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          {insights.map((insight) => (
            <Card
              key={insight.id}
              className={`cursor-pointer p-5 transition-all ${
                selected?.id === insight.id
                  ? "border-[#4F6BF5] ring-2 ring-[#4F6BF5]/20 shadow-[0_4px_16px_rgba(79,107,245,0.1)]"
                  : "hover:border-slate-300 hover:shadow-md"
              }`}
              onClick={() => setSelected(insight)}
            >
              <button type="button" className="w-full text-left cursor-pointer" onClick={() => setSelected(insight)}>
                <h2 className="text-base font-bold text-slate-900">{insight.title}</h2>
                <p className="mt-1 text-xs font-medium text-slate-500 line-clamp-2">{insight.description}</p>
                <div className="mt-4 h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={insight.labels.map((label, index) => ({ label, value: insight.data_points[index] }))}>
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#4F6BF5"
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </button>
            </Card>
          ))}
          {insights.length === 0 && (
            <Card className="p-8 text-center text-sm font-medium text-slate-400">
              No insights generated yet. Click &quot;Generate Insights&quot; to analyze sales data.
            </Card>
          )}
        </div>

        <Card className="p-6">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">{selected.title}</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed max-w-xl">{selected.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => exportInsight(selected)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.delete(`/insights/${selected.id}/`);
                      toast.success("Insight deleted");
                      await load();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-150 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 shadow-2xs transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-8 h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selected.labels.map((label, index) => ({ label, value: selected.data_points[index] }))}>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={customTooltipStyle} formatter={(v: unknown) => [Number(v).toLocaleString("en-IN"), "Value"]} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#4F6BF5"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#4F6BF5" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center text-sm font-medium text-slate-400">
              No insights yet
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
