import {
  Bell,
  Bot,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  ReceiptIndianRupee,
  Settings,
  UserCircle2,
  Users,
  Warehouse,
  X,
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
  const [openGroups, setOpenGroups] = useState({ Bills: true, Inventory: false });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const title = pageTitles[location.pathname] || "InsightLoop";
  const breadcrumbs = useMemo(() => location.pathname.split("/").filter(Boolean), [location.pathname]);

  const initials = (user?.name || "IU").slice(0, 2).toUpperCase();

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20">
          <Boxes className="h-5 w-5 text-teal-300" />
        </div>
        <div>
          <p className="text-[15px] font-bold text-white">InsightLoop</p>
          <p className="text-[10px] tracking-widest text-slate-400">OPS + ANALYTICS</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navGroups.map((group) =>
          group.children ? (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => setOpenGroups((c) => ({ ...c, [group.label]: !c[group.label] }))}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <span className="flex items-center gap-3">
                  <group.icon className="h-4 w-4 text-slate-400" />
                  {group.label}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-slate-500 transition-transform ${openGroups[group.label] ? "rotate-180" : ""}`}
                />
              </button>
              {openGroups[group.label] && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                  {group.children.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                          isActive
                            ? "bg-blue-500/20 font-medium text-blue-300"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        }`
                      }
                    >
                      <ChevronRight className="h-3 w-3 opacity-50" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink
              key={group.to}
              to={group.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-600/20 text-blue-300 ring-1 ring-blue-500/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <group.icon className="h-4 w-4" />
              {group.label}
            </NavLink>
          ),
        )}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.name || "User"}</p>
            <p className="truncate text-xs text-slate-400">{user?.company_name || "Company"}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-rose-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col bg-slate-900 md:flex">{sidebarContent}</aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-slate-900">{title}</h1>
              <nav aria-label="breadcrumb">
                <ol className="flex items-center gap-1 text-xs text-slate-400">
                  {breadcrumbs.map((crumb, i) => (
                    <li key={crumb} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3" />}
                      <span className="capitalize">{crumb.replace("-", " ")}</span>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
              <Bell className="h-4 w-4" />
            </button>
            <div className="hidden items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 md:flex">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {initials}
              </div>
              <span className="text-sm font-medium text-slate-700">{user?.name}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white px-2 py-2 md:hidden">
        {[
          { label: "Home", to: "/dashboard", icon: LayoutDashboard },
          { label: "Bills", to: "/bills/pakka", icon: ReceiptIndianRupee },
          { label: "Stock", to: "/inventory/finished", icon: PackageSearch },
          { label: "AI", to: "/ai-assistant", icon: Bot },
          { label: "Settings", to: "/settings", icon: Settings },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] transition ${
                isActive ? "text-blue-600" : "text-slate-500"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`h-4 w-4 ${isActive ? "stroke-[2.5]" : ""}`} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}