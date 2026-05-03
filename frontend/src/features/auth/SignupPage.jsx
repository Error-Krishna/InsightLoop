import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "../../lib/api";
import { setSession } from "../../lib/auth";

export default function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", company: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/signup/", form);
      setSession({
        access: data.tokens.access,
        refresh: data.tokens.refresh,
        user: data.user,
      });
      toast.success("Account created");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Start your free trial</h1>
        <p className="mt-2 text-sm text-slate-500">Create a workspace for billing, inventory, analytics, and AI.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            { key: "name", label: "Full Name", type: "text" },
            { key: "email", label: "Email", type: "email" },
            { key: "company", label: "Company", type: "text" },
            { key: "password", label: "Password", type: "password" },
          ].map((field) => (
            <label key={field.key} className="block text-sm font-medium text-slate-700">
              {field.label}
              <input
                type={field.type}
                required
                value={form[field.key]}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already using InsightLoop?{" "}
          <Link to="/login" className="font-semibold text-blue-600">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
