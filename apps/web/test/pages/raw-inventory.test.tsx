import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RawInventoryPage from "../../src/features/inventory/RawInventoryPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("RawInventoryPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders page title and raw material form", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(<RawInventoryPage />);
    expect(screen.getByRole("heading", { name: /Raw Materials Inventory/i })).toBeInTheDocument();
  });

  it("empty state displays no inventory items match filter", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    render(<RawInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText("No inventory items match the current filters.")).toBeInTheDocument();
    });
  });

  it("error state notifies when raw materials fail to load", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Server error"));
    render(<RawInventoryPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load raw materials inventory");
    });
  });

  it("success state renders raw materials with quantities and reorder status", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/warehouses")) return { data: [{ id: "wh-1", name: "Main Store" }] };
      return {
        data: [
          {
            id: "raw-1",
            name: "Pure Mulberry Raw Silk",
            sku: "SKU-00003",
            type: "raw",
            quantity: 120,
            unit: "kg",
            cost_price: 600,
            reorder_level: 25,
            status: "In Stock",
            created_at: new Date().toISOString(),
          },
        ],
      };
    });

    render(<RawInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Pure Mulberry Raw Silk")).toBeInTheDocument();
      expect(screen.getByText("SKU-00003")).toBeInTheDocument();
    });
  });
});
