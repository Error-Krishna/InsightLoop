import React, { useState } from "react";
import { toast } from "sonner";
import { UploadCloud, PenTool } from "lucide-react";
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
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "CSV upload failed");
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
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to save manual record");
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-[#4F6BF5]">
            <UploadCloud className="h-4 w-4" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">CSV Upload</h2>
        </div>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Upload business data and refresh dashboard analytics automatically.
        </p>

        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-indigo-200/80 bg-indigo-50/30 p-8 text-center transition hover:bg-indigo-50/50">
            <input
              type="file"
              accept=".csv"
              onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
              className="w-full text-xs font-medium text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-[#4F6BF5] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white file:shadow-xs hover:file:bg-[#435CE6] cursor-pointer"
            />
            {csvFile && (
              <p className="mt-3 text-xs font-bold text-slate-800">
                Selected: {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleCsvUpload}
            disabled={uploading}
            className="w-full rounded-xl bg-[#4F6BF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition hover:bg-[#435CE6] disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload CSV"}
          </button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <PenTool className="h-4 w-4" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Manual Entry</h2>
        </div>
        <form onSubmit={handleManualSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          {(Object.entries(manual) as [keyof ManualRecord, string][]).map(([key, value]) => (
            <label key={key} className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              {key.replaceAll("_", " ")}
              {key === "customer_type" ? (
                <select
                  value={value}
                  onChange={(event) => setManual((current) => ({ ...current, [key]: event.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
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
                  className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-2xs outline-none transition focus:border-[#4F6BF5] focus:ring-4 focus:ring-[#4F6BF5]/10"
                />
              )}
            </label>
          ))}
          <div className="md:col-span-2 mt-2">
            <button
              type="submit"
              disabled={savingManual}
              className="w-full rounded-xl bg-[#4F6BF5] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4F6BF5]/20 transition hover:bg-[#435CE6] disabled:opacity-50"
            >
              {savingManual ? "Saving..." : "Save Record"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
