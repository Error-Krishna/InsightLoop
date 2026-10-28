import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../../lib/api";
import { setSession, User } from "../../lib/auth";
import GoogleSignInButton from "./GoogleSignInButton";

interface SignupResponse {
  tokens: {
    access: string;
    refresh: string;
  };
  user: User;
}

export default function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", company: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<SignupResponse>("/auth/signup/", form);
      setSession({
        access: data.tokens.access,
        refresh: data.tokens.refresh,
        user: data.user,
      });
      toast.success("Account created");
      void navigate("/dashboard", { replace: true });
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  const fields: { key: keyof typeof form; label: string; type: string; placeholder: string }[] = [
    { key: "name", label: "Full Name", type: "text", placeholder: "Alex Morgan" },
    { key: "email", label: "Email", type: "email", placeholder: "alex@company.com" },
    { key: "company", label: "Company", type: "text", placeholder: "Acme Industries" },
    { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4 py-12 relative overflow-hidden">
      {/* Subtle background glow accents */}
      <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-100/60 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-blue-100/60 blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl relative z-10">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#4F6BF5] to-indigo-500 text-white shadow-lg shadow-indigo-500/20 mb-3">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-xl font-bold tracking-tight text-slate-900">InsightLoop</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl bg-white p-8 sm:p-10 shadow-[0_10px_35px_-5px_rgba(15,23,42,0.06),0_2px_10px_rgba(15,23,42,0.02)] border border-slate-100">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Start your free trial</h1>
          <p className="mt-2 text-sm text-slate-500">Create a workspace for billing, inventory, analytics, and AI.</p>
          
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                {field.label}
                <input
                  type={field.type}
                  required
                  placeholder={field.placeholder}
                  value={form[field.key]}
                  onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                />
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 transition-all active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <div className="mt-6">
            <GoogleSignInButton onSuccess={() => navigate("/dashboard", { replace: true })} />
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already using InsightLoop?{" "}
            <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
