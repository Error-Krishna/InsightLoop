import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

interface ProfileValues {
  name: string;
  company_name: string;
  address: string;
  company_email: string;
  company_phone: string;
  gst_number: string;
  bank_account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string;
}

const initialValues: ProfileValues = {
  name: "",
  company_name: "",
  address: "",
  company_email: "",
  company_phone: "",
  gst_number: "",
  bank_account_number: "",
  ifsc_code: "",
  bank_name: "",
  branch_name: "",
};

interface ProfileFiles {
  logo: File | null;
  stamp: File | null;
  signature: File | null;
}

const initialFiles: ProfileFiles = {
  logo: null,
  stamp: null,
  signature: null,
};

export default function ProfilePage() {
  const [values, setValues] = useState<ProfileValues>(initialValues);
  const [files, setFiles] = useState<ProfileFiles>(initialFiles);

  useEffect(() => {
    api
      .get("/profile/")
      .then(({ data }) => {
        setValues({
          name: data.user?.name || "",
          company_name: data.company?.name || "",
          address: data.company?.address || "",
          company_email: data.company?.email || "",
          company_phone: data.company?.phone || "",
          gst_number: data.company?.gst_number || "",
          bank_account_number: data.company?.bank_account_number || "",
          ifsc_code: data.company?.ifsc_code || "",
          bank_name: data.company?.bank_name || "",
          branch_name: data.company?.branch_name || "",
        });
      })
      .catch(() => toast.error("Failed to load profile"));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        payload.append(key, value);
      }
    });
    Object.entries(files).forEach(([key, file]) => {
      if (file) {
        payload.append(key, file);
      }
    });

    try {
      await api.put("/profile/", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Profile updated");
      setFiles(initialFiles);
    } catch {
      toast.error("Failed to update profile");
    }
  }

  const identityFields: [keyof ProfileValues, string, string][] = [
    ["name", "Contact Name", "e.g. John Doe"],
    ["company_name", "Company Name", "e.g. Acme Textiles Ltd"],
    ["company_email", "Company Email", "contact@acme.com"],
    ["company_phone", "Company Phone", "+91 98765 43210"],
    ["address", "Company Address", "123 Industrial Phase 2, City, State"],
  ];

  const bankingFields: [keyof ProfileValues, string, string][] = [
    ["gst_number", "GST Number", "27AAAAA0000A1Z5"],
    ["bank_account_number", "Account Number", "9876543210123"],
    ["ifsc_code", "IFSC Code", "HDFC0001234"],
    ["bank_name", "Bank Name", "HDFC Bank"],
    ["branch_name", "Branch", "Main Industrial Branch"],
  ];

  const fileFields: [keyof ProfileFiles, string, string][] = [
    ["logo", "Company Logo", "PNG, JPG or SVG for invoice header"],
    ["stamp", "Stamp", "Official round seal/stamp image"],
    ["signature", "Signature", "Authorized signatory transparent image"],
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6 md:p-8">
        <div className="border-b border-slate-100 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profile & Company Settings</h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage your personal contact details, organizational identity, banking information, and billing assets.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-lg shadow-sm border border-indigo-100">
                {values.name ? values.name.charAt(0).toUpperCase() : values.company_name ? values.company_name.charAt(0).toUpperCase() : "IL"}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-800">{values.company_name || "InsightLoop Organization"}</p>
                <p className="text-xs text-slate-400">{values.company_email || "Active Workspace"}</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-8">
          {/* Identity & Contact Details */}
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-600">Company & Contact Information</h2>
              <p className="text-xs text-slate-500">Primary legal entity and correspondence information.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {identityFields.map(([key, label, placeholder]) => (
                <label key={key} className={`block text-xs font-semibold text-slate-600 ${key === "address" ? "md:col-span-2" : ""}`}>
                  {label}
                  <input
                    value={values[key] || ""}
                    placeholder={placeholder}
                    onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Tax & Banking Details */}
          <div className="border-t border-slate-100 pt-6">
            <div className="mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-600">Tax & Bank Account Details</h2>
              <p className="text-xs text-slate-500">Used for generating Pakka bills, payment reconciliations, and tax invoices.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {bankingFields.map(([key, label, placeholder]) => (
                <label key={key} className="block text-xs font-semibold text-slate-600">
                  {label}
                  <input
                    value={values[key] || ""}
                    placeholder={placeholder}
                    onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Assets: Logo, Stamp, Signature */}
          <div className="border-t border-slate-100 pt-6">
            <div className="mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-600">Invoice Branding Assets</h2>
              <p className="text-xs text-slate-500">Upload high-resolution graphics for PDF bill letterheads and official authorization.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {fileFields.map(([key, label, hint]) => (
                <label key={key} className="block rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 transition-all hover:bg-slate-50/80">
                  <span className="block text-xs font-semibold text-slate-700">{label}</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>
                  <input
                    type="file"
                    onChange={(event) => setFiles((current) => ({ ...current, [key]: event.target.files?.[0] || null }))}
                    className="mt-3 block w-full text-xs text-slate-500 file:mr-2.5 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-600 hover:file:bg-indigo-100 transition-all cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end border-t border-slate-100 pt-6">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:from-indigo-700 hover:to-indigo-800 transition-all active:scale-[0.99]"
            >
              Save Profile
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
