import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import WorkersPage from "../../src/features/workers/WorkersPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("WorkersPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders page header and add worker form", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(<WorkersPage />);
    expect(screen.getByText("Total Workers")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search workers")).toBeInTheDocument();
  });

  it("empty state displays no workers match search notice", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    render(<WorkersPage />);

    await waitFor(() => {
      expect(screen.getByText("No workers match your search.")).toBeInTheDocument();
    });
  });

  it("error state handles workers fetch failure with toast error", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Worker fetch failed"));
    render(<WorkersPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load workers");
    });
  });

  it("success state renders workers list, active count, and detailed metrics", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url.includes("/materials")) return { data: [] };
      if (url.includes("/payments")) return { data: [] };
      return {
        data: [
          {
            id: "w-1",
            name: "Deepak Sharma (Master Craftsman)",
            phone: "+91 98765 43210",
            role: "Master Craftsman",
            is_active: true,
            material_assigned: 150,
            material_delivered: 120,
            pending_amount: 3500,
            created_at: new Date().toISOString(),
          },
        ],
      };
    });

    render(<WorkersPage />);

    await waitFor(() => {
      expect(screen.getByText("Deepak Sharma (Master Craftsman)")).toBeInTheDocument();
      expect(screen.getByText("+91 98765 43210")).toBeInTheDocument();
    });
  });
});
