import React, { useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

interface ManualRecord {
  date: string;
  product: string;
  category: string;
  quantity: string | number;
  production_cost: string | number;
  selling_price: string | number;
  region: string;
  customer_type: string;
}

const emptyManual: ManualRecord = {
  date: "",
  product: "",
  category: "",
  quantity: "",
  production_cost: "",
  selling_price: "",
  region: "",
  customer_type: "Retail",
};

export default function UploadPage() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [manual, setManual] = useState<ManualRecord>(emptyManual);
  const [uploading, setUploading] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  async function handleCsvUpload() {
    if (!csvFile) {
      toast.error("Please choose a CSV file first");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const { data } = await api.post("/upload/csv/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCsvFile(null);
      toast.success(
        `CSV uploaded successfully${typeof data?.created === "number" ? ` (${data.created} rows)` : ""}`
      );
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "CSV upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleManualSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSavingManual(true);
    try {
      await api.post("/upload/manual/", manual);
      toast.success("Manual record saved");
      setManual(emptyManual);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Failed to save manual record");
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-slate-900">CSV Upload</h2>
        <p className="mt-2 text-sm text-slate-500">Upload business data and refresh dashboard analytics automatically.</p>
        <div className="mt-6 space-y-4">
          <input
            type="file"
            accept=".csv"
            onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
            className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8"
          />
          <button
            type="button"
            onClick={handleCsvUpload}
            disabled={uploading}
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload CSV"}
          </button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold text-slate-900">Manual Entry</h2>
        <form onSubmit={handleManualSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          {(Object.entries(manual) as Array<[keyof ManualRecord, any]>).map(([key, value]) => (
            <label key={key} className="text-sm font-medium text-slate-700">
              {key.replaceAll("_", " ")}
              {key === "customer_type" ? (
                <select
                  value={value}
                  onChange={(event) => setManual((current) => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3"
                >
                  {["Retail", "Wholesale", "Online"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={value}
                  type={key === "date" ? "date" : key.includes("cost") || key.includes("price") || key === "quantity" ? "number" : "text"}
                  onChange={(event) => setManual((current) => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3"
                />
              )}
            </label>
          ))}
          <button
            type="submit"
            disabled={savingManual}
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {savingManual ? "Saving..." : "Save Record"}
          </button>
        </form>
      </Card>
    </div>
  );
}
