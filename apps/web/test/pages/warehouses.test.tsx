import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import WarehousesPage from "../../src/features/inventory/WarehousesPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("WarehousesPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders page header and add warehouse form", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(<WarehousesPage />);
    expect(screen.getByRole("heading", { name: "Warehouses" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Warehouse/i })).toBeInTheDocument();
  });

  it("empty state displays no warehouses created yet", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/warehouse-summary")) return { data: [] };
      return { data: [] };
    });

    render(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText("Create a warehouse to start organizing inventory by location.")).toBeInTheDocument();
    });
  });

  it("error state handles load failure with toast notification", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Warehouse fetch failed"));
    render(<WarehousesPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load warehouse data");
    });
  });

  it("success state renders warehouse list with locations", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/warehouse-summary")) {
        return {
          data: [
            {
              warehouse: {
                id: "wh-1",
                name: "Central Logistics Hub",
                location: "Okhla Phase 3, New Delhi",
              },
              items_count: 45,
              stock_value: 120000,
            },
          ],
        };
      }
      return {
        data: [
          {
            id: "wh-1",
            name: "Central Logistics Hub",
            location: "Okhla Phase 3, New Delhi",
            created_at: new Date().toISOString(),
          },
        ],
      };
    });

    render(<WarehousesPage />);

    await waitFor(() => {
      expect(screen.getByText("Central Logistics Hub")).toBeInTheDocument();
      expect(screen.getByText("Okhla Phase 3, New Delhi")).toBeInTheDocument();
    });
  });
});
