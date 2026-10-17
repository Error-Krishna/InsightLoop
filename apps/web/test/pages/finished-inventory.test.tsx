import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import FinishedInventoryPage from "../../src/features/inventory/FinishedInventoryPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("FinishedInventoryPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders page title and inventory table skeleton", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(<FinishedInventoryPage />);
    expect(screen.getByRole("heading", { name: /Finished Goods Inventory/i })).toBeInTheDocument();
  });

  it("empty state displays empty inventory items notice", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    render(<FinishedInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText("No inventory items match the current filters.")).toBeInTheDocument();
    });
  });

  it("error state notifies when items fail to load", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network failed"));
    render(<FinishedInventoryPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load finished goods inventory");
    });
  });

  it("success state renders loaded finished goods list", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/warehouses")) return { data: [{ id: "wh-1", name: "Central Hub" }] };
      return {
        data: [
          {
            id: "fin-1",
            name: "Premium Embroidered Kurta",
            sku: "SKU-00001",
            type: "finished",
            quantity: 50,
            unit: "pcs",
            selling_price: 1500,
            cost_price: 800,
            reorder_level: 10,
            status: "In Stock",
            created_at: new Date().toISOString(),
          },
        ],
      };
    });

    render(<FinishedInventoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Premium Embroidered Kurta")).toBeInTheDocument();
      expect(screen.getByText("SKU-00001")).toBeInTheDocument();
    });
  });
});
