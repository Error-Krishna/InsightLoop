import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  ChartColumnBig,
  FileSpreadsheet,
  LucideIcon,
  ReceiptIndianRupee,
  Warehouse,
  Check,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
}

const features: Feature[] = [
  {
    icon: ChartColumnBig,
    title: "Analytics Dashboard",
    description: "Real-time revenue, profit, worker, and trend analytics.",
    badge: "Core Metric",
  },
  {
    icon: ReceiptIndianRupee,
    title: "Kacha/Pakka Bills",
    description: "Fast invoice creation for informal and GST-compliant billing.",
    badge: "Billing",
  },
  {
    icon: Warehouse,
    title: "Inventory Management",
    description: "Track finished goods, raw stock, and warehouses in one place.",
    badge: "Real-time",
  },
  {
    icon: Bot,
    title: "AI Assistant",
    description: "Ask for exports, trends, and operational answers from a single chat.",
    badge: "Intelligence",
  },
  {
    icon: BriefcaseBusiness,
    title: "Worker Management",
    description: "Manage assignments, payouts, and productivity by worker.",
    badge: "Workforce",
  },
  {
    icon: FileSpreadsheet,
    title: "Data Export",
    description: "Generate clean CSV exports for finance and operations.",
    badge: "Finance Ready",
  },
];

const plans = [
  {
    name: "Free",
    price: "₹0",
    description: "Core analytics and basic uploads for smaller teams.",
    features: ["Up to 100 orders/mo", "Basic analytics dashboard", "Single warehouse location", "Community support"],
    isPopular: false,
  },
  {
    name: "Pro",
    price: "₹499/mo",
    description: "Billing, inventory, AI workflows, and advanced reporting.",
    features: ["Unlimited Kacha & Pakka bills", "Live raw & finished stock tracking", "AI assistant workflows", "Multi-warehouse dispatch", "Priority email & chat support"],
    isPopular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "Multi-team onboarding, premium support, and tailored rollouts.",
    features: ["Dedicated database tenancy", "Custom ERP integrations", "SLA guarantees & training", "Unlimited worker accounts"],
    isPopular: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#4F6BF5] to-indigo-500 text-white shadow-sm shadow-indigo-500/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">InsightLoop</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              v2.4 Production Ready
            </span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-indigo-50/20 to-[#f4f7fb] pt-12 pb-24 md:pt-20 md:pb-32">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 pointer-events-none">
          <div className="absolute -top-12 left-1/4 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute top-10 right-1/4 h-80 w-80 rounded-full bg-blue-100/50 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-16 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3.5 py-1 text-xs font-semibold text-indigo-700 shadow-xs">
                <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                Enterprise operations, modern analytics
              </div>
              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl leading-[1.12]">
                The Analytics & Operations Platform for Modern Businesses
              </h1>
              <p className="mt-6 max-w-xl text-base sm:text-lg text-slate-600 leading-relaxed">
                Real-time insights, smart billing, inventory control - all in one place.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 transition-all active:scale-[0.98]"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  Sign In
                </Link>
              </div>

              <div className="mt-10 flex items-center gap-6 text-xs font-medium text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-500 stroke-[2.5]" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-500 stroke-[2.5]" />
                  <span>Instant setup</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-500 stroke-[2.5]" />
                  <span>GST compliant</span>
                </div>
              </div>
            </div>

            {/* Quick Hero Feature Grid */}
            <div className="grid max-w-xl flex-1 grid-cols-2 gap-4">
              {features.slice(0, 4).map(({ icon: Icon, title, description, badge }) => (
                <div
                  key={title}
                  className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.03)] transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    {badge && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {badge}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Platform Features Section */}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mb-12 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-600">
            <Sparkles className="h-3.5 w-3.5" />
            Platform Features
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Built for analytics, billing, and warehouse teams
          </h2>
          <p className="mt-2 text-sm text-slate-500 max-w-2xl">
            Everything you need to orchestrate modern manufacturing, inventory supply chains, and worker performance.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ icon: Icon, title, description, badge }) => (
            <div
              key={title}
              className="group rounded-2xl border border-slate-100 bg-white p-7 shadow-[0_2px_12px_rgba(15,23,42,0.03)] transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Icon className="h-6 w-6" />
                </div>
                {badge && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {badge}
                  </span>
                )}
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="border-t border-slate-100 bg-white py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mb-14 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Pricing</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Choose the right operating system for your business
            </h2>
            <p className="mt-3 text-sm text-slate-500">Transparent pricing for organizations of every scale.</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-3 lg:items-stretch">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col justify-between rounded-3xl p-8 transition-all ${
                  plan.isPopular
                    ? "border-2 border-indigo-500 bg-white shadow-xl shadow-indigo-100 ring-4 ring-indigo-50"
                    : "border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-md"
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-gradient-to-r from-indigo-600 to-indigo-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                      Most Popular
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold tracking-tight text-slate-900">{plan.price}</span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">{plan.description}</p>

                  <ul className="mt-6 space-y-2.5 border-t border-slate-100 pt-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 text-xs text-slate-600 font-medium">
                        <Check className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-[#f4f7fb] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row lg:px-8 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white font-bold text-[10px]">
              IL
            </div>
            <span className="font-semibold text-slate-700">InsightLoop</span>
            <span>— Manufacturing & Business Operations Platform</span>
          </div>
          <div>© {new Date().getFullYear()} InsightLoop. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
