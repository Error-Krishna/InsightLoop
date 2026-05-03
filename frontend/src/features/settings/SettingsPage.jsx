import Card from "../../components/Card";
import { getCurrentUser } from "../../lib/auth";

export default function SettingsPage() {
  const user = getCurrentUser();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Workspace Settings</h1>
        <div className="mt-6 space-y-4 text-sm text-slate-600">
          <Setting label="Current Workspace" value={user?.company_name || "Not available"} />
          <Setting label="Authenticated User" value={user?.email || "Not available"} />
          <Setting label="Frontend Stack" value="React 19 + Vite + Tailwind 4" />
          <Setting label="Backend Stack" value="Django + MongoDB + WebSockets" />
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-slate-900">Operational Defaults</h2>
        <div className="mt-6 space-y-3">
          {["Realtime dashboard refresh", "JWT session authentication", "AI assistant enabled", "Inventory workspace mode"].map((item) => (
            <label key={item} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">{item}</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-blue-600" />
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Setting({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-slate-400">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}
