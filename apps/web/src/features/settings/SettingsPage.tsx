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
] as const;

const notificationFields = [
  ["comments", "Comments and mentions"],
  ["weekly_summary", "Weekly summary email"],
  ["updates", "Product updates"],
] as const;

export default function SettingsPage() {
  const user = getCurrentUser();
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
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
      {/* Workspace & Technical Environment */}
      <Card className="p-6 md:p-8">
        <div className="border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Workspace Settings</h1>
              <p className="text-xs text-slate-500">Infrastructure, connected tenancy, and platform parameters.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <Setting
            icon={
              <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            label="Current Workspace"
            value={user?.company_name || "Not available"}
          />
          <Setting
            icon={
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
            label="Authenticated User"
            value={user?.email || "Not available"}
          />
          <Setting
            icon={
              <svg className="h-4 w-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            label="Frontend Stack"
            value="React 19 + TypeScript + Vite + Tailwind 4"
          />
          <Setting
            icon={
              <svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            }
            label="Backend Stack"
            value="Node Express (TypeScript) + MongoDB + WebSockets"
          />
        </div>

        <div className="mt-8 rounded-2xl bg-indigo-50/60 p-4 border border-indigo-100/80">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-900">Security & Isolation</p>
              <p className="mt-0.5 text-xs text-indigo-700/90 leading-relaxed">
                All production data, bill records, worker payments, and raw materials are cryptographically bound to your tenant organization ID.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Operational Defaults & Notifications */}
      <Card className="p-6 md:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Operational Defaults</h2>
              <p className="text-xs text-slate-500">Saved preferences applied across your company workspace.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={loading || saving}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 transition-all active:scale-[0.98]"
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

        <div className="mt-8 border-t border-slate-100 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Notifications</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Alerts</span>
          </div>
          <div className="space-y-3">
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

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-slate-50 px-4 py-3 transition-colors cursor-pointer">
      <span className="text-sm font-medium text-slate-700 select-none">{label}</span>
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 accent-indigo-600 transition-all cursor-pointer"
        />
      </div>
    </label>
  );
}

function Setting({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-4 transition-all hover:bg-slate-50">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-xs border border-slate-100">
            {icon}
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
        </div>
      </div>
      <div className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50"></div>
    </div>
  );
}
