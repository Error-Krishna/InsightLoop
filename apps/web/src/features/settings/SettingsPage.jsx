import { useEffect, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";
import { getCurrentUser } from "../../lib/auth";

const workspaceFields = [
  ["realtime_dashboard_refresh", "Realtime dashboard refresh"],
  ["jwt_session_authentication", "JWT session authentication"],
  ["ai_assistant_enabled", "AI assistant enabled"],
  ["inventory_workspace_mode", "Inventory workspace mode"],
];

const notificationFields = [
  ["comments", "Comments and mentions"],
  ["weekly_summary", "Weekly summary email"],
  ["updates", "Product updates"],
];

export default function SettingsPage() {
  const user = getCurrentUser();
  const [settings, setSettings] = useState({});
  const [notifications, setNotifications] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/profile/settings/")
      .then(({ data }) => {
        setSettings(data.workspace_settings || {});
        setNotifications(data.notifications || {});
      })
      .catch(() => toast.error("Failed to load workspace settings"))
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      const payload = { ...settings, ...notifications };
      const { data } = await api.put("/profile/settings/", payload);
      setSettings(data.workspace_settings || {});
      setNotifications(data.notifications || {});
      toast.success("Settings updated");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Operational Defaults</h2>
            <p className="mt-1 text-sm text-slate-500">These preferences are now saved to your company workspace.</p>
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={loading || saving}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {workspaceFields.map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              checked={Boolean(settings[key])}
              disabled={loading}
              onChange={(checked) => setSettings((current) => ({ ...current, [key]: checked }))}
            />
          ))}
        </div>

        <div className="mt-8">
          <h3 className="text-base font-semibold text-slate-900">Notifications</h3>
          <div className="mt-4 space-y-3">
            {notificationFields.map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={Boolean(notifications[key])}
                disabled={loading}
                onChange={(checked) => setNotifications((current) => ({ ...current, [key]: checked }))}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-blue-600"
      />
    </label>
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
