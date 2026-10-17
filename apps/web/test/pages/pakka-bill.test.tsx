import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PakkaBillPage from "../../src/features/bills/PakkaBillPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("PakkaBillPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders page header and GST bill form", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <PakkaBillPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /^Pakka Bill$/i })).toBeInTheDocument();
  });

  it("empty state displays empty GST invoices message", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    render(
      <MemoryRouter>
        <PakkaBillPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No bills yet\. Create one above\./i)).toBeInTheDocument();
    });
  });

  it("error state handles API failure with error toast", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Database disconnected"));
    render(
      <MemoryRouter>
        <PakkaBillPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load bills");
    });
  });

  it("success state displays loaded pakka invoices", async () => {
    vi.spyOn(api, "get").mockImplementation((url: string) => {
      if (url.startsWith("/inventory/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: [
          {
            id: "bill-201",
            invoice_number: "INV-2026-0001",
            bill_type: "pakka",
            buyer: { name: "Shree Ganesh Textiles", phone: "9812345678" },
            products: [{ name: "Cotton Sarees", quantity: 50, rate: 1200 }],
            grand_total: 60000,
            created_at: new Date().toISOString(),
          },
        ],
      });
    });

    render(
      <MemoryRouter>
        <PakkaBillPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("INV-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Shree Ganesh Textiles")).toBeInTheDocument();
    });
  });
});
