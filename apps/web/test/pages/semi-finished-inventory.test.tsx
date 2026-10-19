import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SemiFinishedInventoryPage from "../../src/features/inventory/SemiFinishedInventoryPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("SemiFinishedInventoryPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading state displays in-production loading text", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <SemiFinishedInventoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("empty state displays no items in production currently", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/live")) return { data: { in_production: [] } };
      return { data: [] };
    });

    render(
      <MemoryRouter>
        <SemiFinishedInventoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Nothing currently in production/i)).toBeInTheDocument();
    });
  });

  it("error state notifies when live items fail to load", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/live")) throw new Error("Network failure");
      return { data: [] };
    });

    render(
      <MemoryRouter>
        <SemiFinishedInventoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load in-production items");
    });
  });

  it("success state renders in-production items and inventory items list", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/live")) {
        return {
          data: {
            in_production: [
              {
                id: "assign-1",
                name: "Silk Dupatta Dyeing",
                assigned_quantity: 100,
                delivered_quantity: 60,
                balance_quantity: 40,
                order: { bill_id: "b1", invoice_number: "INV-100", buyer_name: "Client X" },
              },
            ],
          },
        };
      }
      if (url.includes("/warehouses")) return { data: [] };
      return {
        data: [
          {
            id: "semi-1",
            name: "Dyed Fabric Rolls",
            sku: "SKU-00002",
            type: "semi_finished",
            quantity: 40,
            unit: "meters",
            cost_price: 350,
            status: "In Stock",
            created_at: new Date().toISOString(),
          },
        ],
      };
    });

    render(
      <MemoryRouter>
        <SemiFinishedInventoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Silk Dupatta Dyeing")).toBeInTheDocument();
      expect(screen.getByText(/INV-100/)).toBeInTheDocument();
    });
  });
});
