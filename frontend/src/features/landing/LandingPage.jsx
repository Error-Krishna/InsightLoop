import { ArrowRight, Bot, Boxes, BriefcaseBusiness, ChartColumnBig, FileSpreadsheet, ReceiptIndianRupee, Warehouse } from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  { icon: ChartColumnBig, title: "Analytics Dashboard", description: "Real-time revenue, profit, worker, and trend analytics." },
  { icon: ReceiptIndianRupee, title: "Kacha/Pakka Bills", description: "Fast invoice creation for informal and GST-compliant billing." },
  { icon: Warehouse, title: "Inventory Management", description: "Track finished goods, raw stock, and warehouses in one place." },
  { icon: Bot, title: "AI Assistant", description: "Ask for exports, trends, and operational answers from a single chat." },
  { icon: BriefcaseBusiness, title: "Worker Management", description: "Manage assignments, payouts, and productivity by worker." },
  { icon: FileSpreadsheet, title: "Data Export", description: "Generate clean CSV exports for finance and operations." },
];

const plans = [
  { name: "Free", price: "₹0", description: "Core analytics and basic uploads for smaller teams." },
  { name: "Pro", price: "₹499/mo", description: "Billing, inventory, AI workflows, and advanced reporting." },
  { name: "Enterprise", price: "Custom", description: "Multi-team onboarding, premium support, and tailored rollouts." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
          <div className="flex flex-col gap-16 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1 text-sm font-medium text-blue-200">
                Enterprise operations, modern analytics
              </span>
              <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white lg:text-6xl">
                The Analytics & Operations Platform for Modern Businesses
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Real-time insights, smart billing, inventory control - all in one place.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center rounded-lg border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
                >
                  Sign In
                </Link>
              </div>
            </div>

            <div className="grid max-w-xl flex-1 grid-cols-2 gap-4">
              {features.slice(0, 4).map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                  <Icon className="h-8 w-8 text-cyan-300" />
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Platform Features</p>
          <h2 className="mt-3 text-3xl font-semibold">Built for analytics, billing, and warehouse teams</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <Icon className="h-10 w-10 text-blue-400" />
              <h3 className="mt-4 text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-950/60">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold">Choose the right operating system for your business</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.name} className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-4 text-4xl font-semibold text-white">{plan.price}</p>
                <p className="mt-4 text-sm leading-6 text-slate-300">{plan.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
