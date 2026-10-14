import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
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
      load();
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
          <h1 className="text-2xl font-semibold text-slate-900">Business Insights</h1>
          <p className="text-sm text-slate-500">Keep the current sales analysis logic, now in a React experience.</p>
        </div>
        <button
          type="button"
          onClick={generateInsights}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Insights"}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          {insights.map((insight) => (
            <Card
              key={insight.id}
              className={`cursor-pointer p-5 ${selected?.id === insight.id ? "ring-2 ring-blue-500" : ""}`}
              onClick={() => setSelected(insight)}
            >
              <button type="button" className="w-full text-left" onClick={() => setSelected(insight)}>
                <h2 className="text-lg font-semibold text-slate-900">{insight.title}</h2>
                <p className="mt-2 text-sm text-slate-500">{insight.description}</p>
                <div className="mt-4 h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={insight.labels.map((label, index) => ({ label, value: insight.data_points[index] }))}>
                      <Line dataKey="value" stroke="#2563eb" dot={false} strokeWidth={2.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </button>
            </Card>
          ))}
          {insights.length === 0 && (
            <Card className="p-6 text-sm text-slate-400">
              No insights generated yet. Click &quot;Generate Insights&quot; to analyze sales data.
            </Card>
          )}
        </div>

        <Card className="p-6">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">{selected.title}</h2>
                  <p className="mt-2 text-sm text-slate-500">{selected.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => exportInsight(selected)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.delete(`/insights/${selected.id}/`);
                      toast.success("Insight deleted");
                      load();
                    }}
                    className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-8 h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selected.labels.map((label, index) => ({ label, value: selected.data_points[index] }))}>
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => [Number(v).toLocaleString("en-IN"), "Value"]} />
                    <Line dataKey="value" stroke="#2563eb" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">No insights yet</div>
          )}
        </Card>
      </div>
    </div>
  );
}
