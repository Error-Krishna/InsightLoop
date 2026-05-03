import { useState } from "react";
import { toast } from "sonner";
import Card from "../../components/Card";
import api from "../../lib/api";

export default function UploadPage() {
  const [csvFile, setCsvFile] = useState(null);
  const [manual, setManual] = useState({ date: "", product: "", category: "", quantity: "", production_cost: "", selling_price: "", region: "", customer_type: "Retail" });

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-slate-900">CSV Upload</h2>
        <p className="mt-2 text-sm text-slate-500">Upload business data and refresh dashboard analytics automatically.</p>
        <div className="mt-6 space-y-4">
          <input type="file" accept=".csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8" />
          <button
            type="button"
            onClick={async () => {
              const formData = new FormData();
              formData.append("file", csvFile);
              await api.post("/upload/csv/", formData, { headers: { "Content-Type": "multipart/form-data" } });
              toast.success("CSV uploaded successfully");
            }}
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Upload CSV
          </button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold text-slate-900">Manual Entry</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await api.post("/upload/manual/", manual);
            toast.success("Manual record saved");
          }}
          className="mt-6 grid gap-4 md:grid-cols-2"
        >
          {Object.entries(manual).map(([key, value]) => (
            <label key={key} className="text-sm font-medium text-slate-700">
              {key.replaceAll("_", " ")}
              {key === "customer_type" ? (
                <select value={value} onChange={(event) => setManual((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3">
                  {["Retail", "Wholesale", "Online"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={value} onChange={(event) => setManual((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-4 py-3" />
              )}
            </label>
          ))}
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
            Save Record
          </button>
        </form>
      </Card>
    </div>
  );
}
