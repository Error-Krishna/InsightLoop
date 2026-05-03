import {
  Bell,
  Bot,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  ReceiptIndianRupee,
  Settings,
  UserCircle2,
  Users,
  Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getCurrentUser } from "../../lib/auth";

const navGroups = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  {
    label: "Bills",
    icon: ReceiptIndianRupee,
    children: [
      { label: "Kacha Bills", to: "/bills/kacha" },
      { label: "Pakka Bills", to: "/bills/pakka" },
    ],
  },
  {
    label: "Inventory",
    icon: Warehouse,
    children: [
      { label: "Finished Goods", to: "/inventory/finished" },
      { label: "Raw Materials", to: "/inventory/raw" },
      { label: "Warehouses", to: "/inventory/warehouses" },
    ],
  },
  { label: "Insights", to: "/insights", icon: ChartNoAxesCombined },
  { label: "Workers", to: "/workers", icon: Users },
  { label: "Upload", to: "/upload", icon: FileSpreadsheet },
  { label: "AI Assistant", to: "/ai-assistant", icon: Bot },
  { label: "Profile", to: "/profile", icon: UserCircle2 },
  { label: "Settings", to: "/settings", icon: Settings },
];

const pageTitles = {
  "/dashboard": "Dashboard",
  "/bills/kacha": "Kacha Bills",
  "/bills/pakka": "Pakka Bills",
  "/inventory/finished": "Finished Inventory",
  "/inventory/raw": "Raw Inventory",
  "/inventory/warehouses": "Warehouses",
  "/insights": "Insights",
  "/workers": "Workers",
  "/upload": "Data Upload",
  "/ai-assistant": "AI Assistant",
  "/profile": "Profile",
  "/settings": "Settings",
};

export default function DashboardLayout() {
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState({ Bills: true, Inventory: true });
  const title = pageTitles[location.pathname] || "InsightLoop";
  const breadcrumbs = useMemo(() => location.pathname.split("/").filter(Boolean), [location.pathname]);

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 flex-col bg-slate-900 text-slate-200 md:flex">
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">InsightLoop</p>
            <p className="text-xs text-slate-400">Ops + Analytics</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-5">
          {navGroups.map((group) =>
            group.children ? (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
                >
                  <span className="flex items-center gap-3">
                    <group.icon className="h-4 w-4 text-slate-400" />
                    {group.label}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition ${openGroups[group.label] ? "rotate-180" : ""}`} />
                </button>
                {openGroups[group.label] && (
                  <div className="mt-1 space-y-1 border-l border-slate-800 pl-3">
                    {group.children.map((item) => (
                      <SidebarLink key={item.to} to={item.to} label={item.label} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <SidebarLink key={group.to} to={group.to} label={group.label} icon={group.icon} />
            ),
          )}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
              {(user?.name || "IU").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
              <p className="truncate text-xs text-slate-400">{user?.company_name}</p>
            </div>
            <button type="button" onClick={handleLogout} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{breadcrumbs.join(" / ") || "overview"}</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-lg border border-slate-200 p-2 text-slate-500">
              <Bell className="h-4 w-4" />
            </button>
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 md:flex">
              <UserCircle2 className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-700">{user?.name}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50 p-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white px-2 py-2 md:hidden">
        {[
          { label: "Home", to: "/dashboard", icon: LayoutDashboard },
          { label: "Bills", to: "/bills/pakka", icon: ReceiptIndianRupee },
          { label: "Stock", to: "/inventory/finished", icon: PackageSearch },
          { label: "AI", to: "/ai-assistant", icon: Bot },
          { label: "Settings", to: "/settings", icon: Settings },
        ].map((item) => (
          <NavLink key={item.to} to={item.to} className="flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs text-slate-600">
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SidebarLink({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition ${
          isActive
            ? "border-blue-400 bg-blue-600/20 text-blue-400"
            : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      {Icon ? <Icon className="h-4 w-4" /> : <span className="h-4 w-4" />}
      {label}
    </NavLink>
  );
}
