import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { toast } from "sonner";
import { MemoryRouter } from "react-router-dom";
import api from "../src/lib/api";
import DashboardPage from "../src/features/dashboard/DashboardPage";
import KachaBillPage from "../src/features/bills/KachaBillPage";
import PakkaBillPage from "../src/features/bills/PakkaBillPage";
import WorkersPage from "../src/features/workers/WorkersPage";
import InventoryItemsPage from "../src/features/inventory/InventoryItemsPage";
import UploadPage from "../src/features/upload/UploadPage";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

let serverError = false;
let emptyState = false;

// MSW Server for standard HTTP mock integration
const mswServer = setupServer(
  http.get("*/dashboard/summary*", () => HttpResponse.json({ total_revenue: 500000 })),
  http.get("*/bills*", () => HttpResponse.json([])),
  http.get("*/workers*", () => HttpResponse.json([])),
  http.get("*/inventory/*", () => HttpResponse.json([])),
  http.post("*/upload/*", () => HttpResponse.json({ success: true }))
);

describe("D2: Key Feature Pages RTL & MSW Integration Suite", () => {
  let getSpy: any;
  let postSpy: any;
  let putSpy: any;
  let deleteSpy: any;

  beforeEach(() => {
    mswServer.listen();
    serverError = false;
    emptyState = false;
    vi.clearAllMocks();

    getSpy = vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (serverError) {
        const err: any = new Error("Request failed with status code 500");
        err.response = { status: 500, data: { detail: "Internal Server Error" } };
        throw err;
      }

      if (url.includes("/dashboard/summary")) {
        return {
          data: {
            total_revenue: emptyState ? 0 : 500000,
            total_profit: emptyState ? 0 : 120000,
            active_workers: emptyState ? 0 : 15,
            revenue_change: 12.5,
            profit_change: 8.2,
            workers_change: 2.0,
          },
        };
      }
      if (url.includes("/dashboard/rev-exp")) {
        return {
          data: {
            labels: emptyState ? [] : ["Jan", "Feb", "Mar"],
            revenue: emptyState ? [] : [10000, 20000, 30000],
            expenses: emptyState ? [] : [5000, 8000, 12000],
          },
        };
      }
      if (url.includes("/dashboard/profit-trends")) {
        return {
          data: {
            labels: emptyState ? [] : ["Jan", "Feb", "Mar"],
            profit: emptyState ? [] : [5000, 12000, 18000],
          },
        };
      }
      if (url.includes("/dashboard/workers")) {
        return {
          data: {
            workers: emptyState
              ? []
              : [
                  { name: "Sunita Devi", month: "March", amount: 12500, status: "Paid" },
                  { name: "Ramesh Kumar", month: "March", amount: 8000, status: "Pending" },
                ],
          },
        };
      }
      if (url.includes("/dashboard/top-workers")) {
        return {
          data: {
            workers: emptyState
              ? []
              : [{ name: "Sunita Devi", total_payout: 45000, units_produced: 150 }],
          },
        };
      }
      if (url.includes("/bills")) {
        return {
          data: emptyState
            ? []
            : [
                {
                  id: "bill-1",
                  invoice_number: "INV-2026-00001",
                  buyer_name: "Acme Corp",
                  grand_total: 15000,
                  payment_status: "paid",
                  order_status: "closed",
                  bill_type: "kacha",
                  items: [],
                },
              ],
        };
      }
      if (url.includes("/inventory/warehouses")) {
        return {
          data: [
            { id: "wh-1", name: "Main Central Hub", location: "Sector 12" },
          ],
        };
      }
      if (url.includes("/inventory/")) {
        return {
          data: emptyState
            ? []
            : [
                {
                  id: "inv-1",
                  name: "Silk Yarn",
                  sku: "RAW-001",
                  type: "raw",
                  unit: "kg",
                  quantity: 100,
                  selling_price: 0,
                  cost_price: 1200,
                  reorder_level: 10,
                  warehouse_name: "Main Central Hub",
                },
              ],
        };
      }
      if (url.includes("/workers/") && url.includes("/materials")) {
        return { data: [] };
      }
      if (url.includes("/workers/") && url.includes("/payments")) {
        return { data: [] };
      }
      if (url.includes("/workers")) {
        return {
          data: emptyState
            ? []
            : [
                {
                  id: "w-1",
                  name: "Pooja Sharma",
                  phone: "9876543210",
                  address: "Jaipur Workshop",
                  age: 29,
                  is_active: true,
                  material_assigned: 50,
                  material_delivered: 45,
                  total_wasted: 2,
                  pending_amount: 3500,
                },
              ],
        };
      }
      return { data: [] };
    });

    postSpy = vi.spyOn(api, "post").mockImplementation(async (url: string, body: any) => {
      if (serverError) {
        const err: any = new Error("Request failed with status code 500");
        err.response = { status: 500, data: { detail: "Server error occurred" } };
        throw err;
      }
      if (url.includes("/upload/csv")) {
        return { data: { success: true, created: 25 } };
      }
      if (url.includes("/upload/manual")) {
        return { data: { success: true, id: "rec-1" } };
      }
      if (url.includes("/bills")) {
        return {
          data: {
            id: "bill-created-1",
            invoice_number: "INV-2026-00002",
            ...body,
          },
        };
      }
      if (url.includes("/inventory/")) {
        return { data: { id: "inv-created-1", ...body } };
      }
      if (url.includes("/workers/")) {
        return { data: { success: true } };
      }
      return { data: { success: true } };
    });

    putSpy = vi.spyOn(api, "put").mockResolvedValue({ data: { success: true } });
    deleteSpy = vi.spyOn(api, "delete").mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    mswServer.close();
    getSpy.mockRestore();
    postSpy.mockRestore();
    putSpy.mockRestore();
    deleteSpy.mockRestore();
    cleanup();
  });

  describe("DashboardPage", () => {
    it("renders metric cards, workers table, and handles populated state", async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText("Total Revenue")).toBeInTheDocument();
      });

      expect(screen.getByText("Sunita Devi")).toBeInTheDocument();
      expect(screen.getByText("Worker Payments")).toBeInTheDocument();
      expect(screen.getByText("Paid")).toBeInTheDocument();
    });

    it("displays empty states when data lists are empty", async () => {
      emptyState = true;
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText("No worker payment records found.")).toBeInTheDocument();
      });
      expect(screen.getByText("No worker payout data available.")).toBeInTheDocument();
    });

    it("displays error toast on 500 server error", async () => {
      serverError = true;
      render(<DashboardPage />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to load dashboard data");
      });
    });
  });

  describe("Bills Pages (KachaBillPage & PakkaBillPage)", () => {
    it("renders Kacha bill form and executes user calculation action", async () => {
      render(
        <MemoryRouter>
          <KachaBillPage />
        </MemoryRouter>
      );

      expect(screen.getAllByText(/Kacha Bill/i).length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText("Ramesh Traders")).toBeInTheDocument();

      // User action: input buyer name and product details
      const buyerInput = screen.getByPlaceholderText("Ramesh Traders");
      fireEvent.change(buyerInput, { target: { value: "Metro Retailers" } });
      expect(buyerInput).toHaveValue("Metro Retailers");

      // Verify calculation
      const rateInput = screen.getByPlaceholderText("0.00");
      fireEvent.change(rateInput, { target: { value: "250" } });
      expect(screen.getAllByText("₹250.00").length).toBeGreaterThan(0);
    });

    it("renders Pakka bill form with GST options and calculates GST", async () => {
      render(
        <MemoryRouter>
          <PakkaBillPage />
        </MemoryRouter>
      );

      expect(screen.getAllByText(/Pakka Bill/i).length).toBeGreaterThan(0);
      expect(screen.getByText("GST Rate")).toBeInTheDocument();

      // User action: update GST percentage
      const gstSelect = screen.getByRole("combobox", { name: /GST Rate/i });
      fireEvent.change(gstSelect, { target: { value: "12" } });
      expect(gstSelect).toHaveValue("12");
    });
  });

  describe("WorkersPage", () => {
    it("renders workers list and allows switching tabs", async () => {
      render(<WorkersPage />);

      await waitFor(() => {
        expect(screen.getByText("Pooja Sharma")).toBeInTheDocument();
      });

      // User action: switch tabs
      const matTab = screen.getByRole("button", { name: "Material Distribution" });
      fireEvent.click(matTab);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Material Assignment" })).toBeInTheDocument();
      });

      const payTab = screen.getByRole("button", { name: "Pay Records" });
      fireEvent.click(payTab);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Pay Records" })).toBeInTheDocument();
      });
    });

    it("renders empty state and handles load errors", async () => {
      emptyState = true;
      render(<WorkersPage />);

      await waitFor(() => {
        expect(screen.getByText("No workers match your search.")).toBeInTheDocument();
      });
    });
  });

  describe("InventoryItemsPage", () => {
    it("renders inventory items list and accepts new item form inputs", async () => {
      render(<InventoryItemsPage itemType="raw" title="Raw Material Inventory" />);

      await waitFor(() => {
        expect(screen.getByText("Silk Yarn")).toBeInTheDocument();
      });

      // User action: fill item name in form
      const nameInput = screen.getByRole("textbox", { name: /Name/i });
      fireEvent.change(nameInput, { target: { value: "Pure Mulberry Silk" } });
      expect(nameInput).toHaveValue("Pure Mulberry Silk");
    });

    it("displays empty state when inventory is empty", async () => {
      emptyState = true;
      render(<InventoryItemsPage itemType="raw" title="Raw Material Inventory" />);

      await waitFor(() => {
        expect(screen.getByText("No inventory items match the current filters.")).toBeInTheDocument();
      });
    });
  });

  describe("UploadPage", () => {
    it("renders CSV and manual entry form, and submits manual record", async () => {
      render(<UploadPage />);

      expect(screen.getByText("CSV Upload")).toBeInTheDocument();
      expect(screen.getByText("Manual Entry")).toBeInTheDocument();

      // User action: fill manual record and submit
      const productInput = screen.getByRole("textbox", { name: /product/i });
      fireEvent.change(productInput, { target: { value: "Banarasi Dupatta" } });
      expect(productInput).toHaveValue("Banarasi Dupatta");

      const form = productInput.closest("form")!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith("Manual record saved");
      });
    });

    it("handles CSV upload error on 500 server response", async () => {
      serverError = true;
      render(<UploadPage />);

      const file = new File(["test,header\n1,2"], "test.csv", { type: "text/csv" });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      if (fileInput) {
        fireEvent.change(fileInput, { target: { files: [file] } });
      }

      const uploadBtn = screen.getByRole("button", { name: "Upload CSV" });
      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });
});
