import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "../../src/features/dashboard/DashboardPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("DashboardPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading state displays skeleton or spinner initially", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {})); // Never resolves
    render(<DashboardPage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("empty state displays zeroed metrics and empty list notices", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/summary")) {
        return { data: { total_revenue: 0, total_profit: 0, active_workers: 0 } };
      }
      if (url.includes("/rev-exp")) {
        return { data: { labels: [], revenue: [], expenses: [] } };
      }
      if (url.includes("/profit-trends")) {
        return { data: { labels: [], profit: [] } };
      }
      if (url.includes("/workers")) {
        return { data: { workers: [] } };
      }
      if (url.includes("/top-workers")) {
        return { data: { workers: [] } };
      }
      return { data: {} };
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText("₹0").length).toBeGreaterThan(0);
      expect(screen.getByText("No worker payment records found.")).toBeInTheDocument();
    });
  });

  it("error state notifies with toast when API calls fail", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Dashboard data fetch failed"));
    render(<DashboardPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load dashboard data");
    });
  });

  it("success state renders chart metrics and worker distributions", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/summary")) {
        return {
          data: {
            total_revenue: 760400,
            total_profit: 304000,
            active_workers: 12,
            revenue_change: 15.4,
            profit_change: 10.2,
            workers_change: 5.0,
          },
        };
      }
      if (url.includes("/rev-exp")) {
        return { data: { labels: ["Jan", "Feb"], revenue: [40000, 60000], expenses: [20000, 30000] } };
      }
      if (url.includes("/profit-trends")) {
        return { data: { labels: ["Jan", "Feb"], profit: [20000, 30000] } };
      }
      if (url.includes("/workers")) {
        return { data: { workers: [{ name: "Sunita Devi", month: "March", amount: 12500, status: "Paid" }] } };
      }
      if (url.includes("/top-workers")) {
        return { data: { workers: [{ name: "Sunita Devi", total_payout: 45000, units_produced: 150 }] } };
      }
      return { data: {} };
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Sunita Devi").length).toBeGreaterThan(0);
      expect(screen.getByText("₹7,60,400")).toBeInTheDocument();
    });
  });
});
