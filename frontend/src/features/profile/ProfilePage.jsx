import { useEffect, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

export default function ProfilePage() {
  const [form, setForm] = useState(new FormDataState());

  useEffect(() => {
    api.get("/profile/").then(({ data }) => setForm(new FormDataState(data))).catch(() => toast.error("Failed to load profile"));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = new FormData();
    Object.entries(form.values).forEach(([key, value]) => {
      if (value !== null && value !== undefined) payload.append(key, value);
    });
    Object.entries(form.files).forEach(([key, value]) => {
      if (value) payload.append(key, value);
    });

    await api.put("/profile/", payload, { headers: { "Content-Type": "multipart/form-data" } });
    toast.success("Profile updated");
  }

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Profile & Company Settings</h1>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
        {[
          ["name", "Contact Name"],
          ["company_name", "Company Name"],
          ["address", "Company Address"],
          ["company_email", "Company Email"],
          ["company_phone", "Company Phone"],
          ["gst_number", "GST Number"],
          ["bank_account_number", "Account Number"],
          ["ifsc_code", "IFSC Code"],
          ["bank_name", "Bank Name"],
          ["branch_name", "Branch"],
        ].map(([key, label]) => (
          <label key={key} className="text-sm font-medium text-slate-700">
            {label}
            <input value={form.values[key] || ""} onChange={(event) => form.setValue(setForm, key, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3" />
          </label>
        ))}
        {[
          ["logo", "Company Logo"],
          ["stamp", "Stamp"],
          ["signature", "Signature"],
        ].map(([key, label]) => (
          <label key={key} className="text-sm font-medium text-slate-700">
            {label}
            <input type="file" onChange={(event) => form.setFile(setForm, key, event.target.files?.[0] || null)} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3" />
          </label>
        ))}
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
          Save Profile
        </button>
      </form>
    </Card>
  );
}

class FormDataState {
  constructor(payload = {}) {
    this.values = {
      name: payload.user?.name || "",
      company_name: payload.company?.name || "",
      address: payload.company?.address || "",
      company_email: payload.company?.email || "",
      company_phone: payload.company?.phone || "",
      gst_number: payload.company?.gst_number || "",
      bank_account_number: payload.company?.bank_account_number || "",
      ifsc_code: payload.company?.ifsc_code || "",
      bank_name: payload.company?.bank_name || "",
      branch_name: payload.company?.branch_name || "",
    };
    this.files = { logo: null, stamp: null, signature: null };
  }

  setValue(setter, key, value) {
    setter((current) => {
      const next = new FormDataState();
      next.values = { ...current.values, [key]: value };
      next.files = current.files;
      return next;
    });
  }

  setFile(setter, key, value) {
    setter((current) => {
      const next = new FormDataState();
      next.values = current.values;
      next.files = { ...current.files, [key]: value };
      return next;
    });
  }
}
