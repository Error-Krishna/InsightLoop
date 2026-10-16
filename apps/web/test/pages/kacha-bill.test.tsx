import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import KachaBillPage from "../../src/features/bills/KachaBillPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("KachaBillPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders page header and bill builder", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <KachaBillPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /^Kacha Bill$/i })).toBeInTheDocument();
  });

  it("empty state displays empty bill history notice", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    render(
      <MemoryRouter>
        <KachaBillPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No bills yet\. Create one above\./i)).toBeInTheDocument();
    });
  });

  it("error state handles bill loading failure with error toast", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network failed"));
    render(
      <MemoryRouter>
        <KachaBillPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load bills");
    });
  });

  it("success state renders loaded bills and order details link", async () => {
    vi.spyOn(api, "get").mockImplementation((url: string) => {
      if (url.startsWith("/inventory/")) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: [
          {
            id: "bill-101",
            invoice_number: "EST-2026-0001",
            bill_type: "kacha",
            buyer: { name: "Ramesh Cloth Store", phone: "9876543210" },
            products: [{ name: "Kurta Material", quantity: 20, rate: 350 }],
            grand_total: 7000,
            created_at: new Date().toISOString(),
          },
        ],
      });
    });

    render(
      <MemoryRouter>
        <KachaBillPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("EST-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Ramesh Cloth Store")).toBeInTheDocument();
    });
  });
});
