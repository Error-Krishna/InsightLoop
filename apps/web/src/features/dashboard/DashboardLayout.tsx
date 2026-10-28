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
  LucideIcon,
  Menu,
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

interface NavItem {
  label: string;
  to: string;
}

interface NavGroup {
  label: string;
  to?: string;
  icon: LucideIcon;
  children?: NavItem[];
}

const navGroups: NavGroup[] = [
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
      { label: "Work in Progress", to: "/inventory/semi-finished" },
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

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/bills/kacha": "Kacha Bills",
  "/bills/pakka": "Pakka Bills",
  "/inventory/finished": "Finished Inventory",
  "/inventory/semi-finished": "Work in Progress Inventory",
  "/inventory/raw": "Raw Inventory",
  "/inventory/warehouses": "Warehouses",
  "/insights": "Insights",
  "/workers": "Workers",
  "/upload": "Data Upload",
  "/ai-assistant": "AI Assistant",
  "/profile": "Profile",
  "/settings": "Settings",
};

function resolvePageTitle(pathname: string): string {
  if (pathname.startsWith("/bills/order/")) return "Order Details";
  return pageTitles[pathname] || "InsightLoop";
}

export default function DashboardLayout() {
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Bills: true, Inventory: false });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const title = resolvePageTitle(location.pathname);
  const breadcrumbs = useMemo(() => location.pathname.split("/").filter(Boolean), [location.pathname]);

  const initials = (user?.name || "IU").slice(0, 2).toUpperCase();

  function handleLogout() {
    clearSession();
    void navigate("/login", { replace: true });
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#4F6BF5] text-white shadow-md shadow-[#4F6BF5]/20">
          <Boxes className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[15px] font-bold tracking-tight text-slate-900">InsightLoop</p>
          <p className="text-[10px] font-semibold tracking-widest text-slate-400">OPS + ANALYTICS</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) =>
          group.children ? (
            <div key={group.label} className="space-y-1">
              <button
                type="button"
                onClick={() => setOpenGroups((c) => ({ ...c, [group.label]: !c[group.label] }))}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100/70 hover:text-slate-900"
              >
                <span className="flex items-center gap-3">
                  <group.icon className="h-4 w-4 text-slate-400" />
                  {group.label}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                    openGroups[group.label] ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openGroups[group.label] && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-100 pl-3">
                  {group.children.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                          isActive
                            ? "bg-indigo-50/80 font-semibold text-[#4F6BF5]"
                            : "text-slate-500 hover:bg-slate-100/60 hover:text-slate-800"
                        }`
                      }
                    >
                      <ChevronRight className="h-3 w-3 opacity-40" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink
              key={group.to}
              to={group.to!}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-[#4F6BF5] font-semibold text-white shadow-md shadow-[#4F6BF5]/20"
                    : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
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
      <div className="border-t border-slate-100 bg-slate-50/50 p-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-3 shadow-xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F6BF5] to-[#3849C7] text-xs font-bold text-white shadow-xs">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{user?.name || "User"}</p>
            <p className="truncate text-xs text-slate-400">{user?.company_name || "Company"}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[#f4f7fb]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-200/70 bg-white shadow-[2px_0_12px_rgba(15,23,42,0.02)] md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 h-full w-full cursor-default border-none bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-slate-200/70 bg-white shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md shadow-xs md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">{title}</h1>
              <nav aria-label="breadcrumb">
                <ol className="flex items-center gap-1 text-xs font-medium text-slate-400">
                  {breadcrumbs.map((crumb, i) => (
                    <li key={crumb} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
                      <span className="capitalize">{crumb.replace("-", " ")}</span>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="rounded-xl border border-slate-200/80 bg-white p-2 text-slate-500 shadow-2xs transition hover:bg-slate-50 hover:text-slate-800"
            >
              <Bell className="h-4 w-4" />
            </button>
            <div className="hidden items-center gap-2.5 rounded-full border border-slate-200/80 bg-slate-50/80 py-1 pl-1.5 pr-3.5 shadow-2xs md:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4F6BF5] text-xs font-bold text-white">
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
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200/80 bg-white/95 px-2 py-2 backdrop-blur-md md:hidden">
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
              `flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] transition ${
                isActive ? "font-semibold text-[#4F6BF5]" : "text-slate-500"
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
