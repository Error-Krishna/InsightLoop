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

  const fields: Array<[keyof ProfileValues, string]> = [
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
  ];

  const fileFields: Array<[keyof ProfileFiles, string]> = [
    ["logo", "Company Logo"],
    ["stamp", "Stamp"],
    ["signature", "Signature"],
  ];

  return (
    <Card className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Profile & Company Settings</h1>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
        {fields.map(([key, label]) => (
          <label key={key} className="text-sm font-medium text-slate-700">
            {label}
            <input
              value={values[key] || ""}
              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3"
            />
          </label>
        ))}

        {fileFields.map(([key, label]) => (
          <label key={key} className="text-sm font-medium text-slate-700">
            {label}
            <input
              type="file"
              onChange={(event) => setFiles((current) => ({ ...current, [key]: event.target.files?.[0] || null }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3"
            />
          </label>
        ))}

        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
          Save Profile
        </button>
      </form>
    </Card>
  );
}
