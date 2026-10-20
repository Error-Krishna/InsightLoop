import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OrderDetailPage from "../../src/features/bills/OrderDetailPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("OrderDetailPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading state displays Loading order indicator", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={["/bills/order/order-1"]}>
        <Routes>
          <Route path="/bills/order/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Loading order…")).toBeInTheDocument();
  });

  it("empty state displays Order not found when bill is null", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/bills/order-1/")) return { data: null };
      return { data: [] };
    });

    render(
      <MemoryRouter initialEntries={["/bills/order/order-1"]}>
        <Routes>
          <Route path="/bills/order/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Order not found.")).toBeInTheDocument();
    });
  });

  it("error state handles API failure and triggers error toast", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network failed"));

    render(
      <MemoryRouter initialEntries={["/bills/order/order-1"]}>
        <Routes>
          <Route path="/bills/order/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load order");
    });
  });

  it("success state renders bill summary, items, and workflow sections", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/assignments/")) return { data: [] };
      if (url.includes("/workers/")) return { data: [{ id: "w1", name: "Ramesh" }] };
      if (url.includes("/inventory/")) return { data: [] };
      return {
        data: {
          id: "order-1",
          invoice_number: "INV-2026-0001",
          bill_type: "pakka",
          buyer: { name: "Acme Buyer Pvt Ltd", phone: "9876543210" },
          products: [{ name: "Handloom Saree", quantity: 5, rate: 2000 }],
          grand_total: 10000,
          created_at: new Date().toISOString(),
        },
      };
    });

    render(
      <MemoryRouter initialEntries={["/bills/order/order-1"]}>
        <Routes>
          <Route path="/bills/order/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("INV-2026-0001")).toBeInTheDocument();
      expect(screen.getByText(/Acme Buyer Pvt Ltd/)).toBeInTheDocument();
      expect(screen.getByText("Production")).toBeInTheDocument();
    });
  });

  it("renders movement history and line unit in progress table", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/assignments/")) return { data: [] };
      if (url.includes("/workers/"))
        return {
          data: [
            { id: "w1", name: "Active Ramesh", is_active: true },
            { id: "w2", name: "Inactive Suresh", is_active: false },
          ],
        };
      if (url.includes("/inventory/movements"))
        return {
          data: [
            {
              id: "m1",
              company_id: "c1",
              date: "2026-03-01T10:00:00Z",
              type: "raw_issue",
              item_name: "Raw Silk",
              quantity: 20,
              worker_id: "w1",
              notes: "Initial distribution",
              created_at: "2026-03-01T10:00:00Z",
            },
          ],
        };
      if (url.includes("/inventory/raw/"))
        return { data: [{ id: "r1", name: "Raw Silk", unit: "kg", quantity: 50 }] };
      return {
        data: {
          id: "order-1",
          invoice_number: "INV-2026-0002",
          bill_type: "pakka",
          buyer: { name: "Test Buyer" },
          products: [{ name: "Handloom Saree", quantity: 5, rate: 2000, unit: "pieces" }],
          grand_total: 10000,
          created_at: new Date().toISOString(),
        },
      };
    });

    render(
      <MemoryRouter initialEntries={["/bills/order/order-1"]}>
        <Routes>
          <Route path="/bills/order/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Movement History")).toBeInTheDocument();
      expect(screen.getByText("Raw Issue")).toBeInTheDocument();
      expect(screen.getByText("Raw Silk")).toBeInTheDocument();
      expect(screen.getByText("Worker: Active Ramesh")).toBeInTheDocument();
      expect(screen.getByText("5 pieces")).toBeInTheDocument();
    });
  });
});
