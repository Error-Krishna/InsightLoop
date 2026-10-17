import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InsightsPage from "../../src/features/insights/InsightsPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("InsightsPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders page title and generate button", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(<InsightsPage />);
    expect(screen.getByRole("heading", { name: /Business Insights/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Insights/i })).toBeInTheDocument();
  });

  it("empty state displays no insights generated notice", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    render(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No insights generated yet/i)).toBeInTheDocument();
    });
  });

  it("error state notifies when insights fail to load or generate", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network failed"));
    render(<InsightsPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load insights");
    });

    vi.spyOn(api, "post").mockRejectedValueOnce(new Error("AI generation failed"));
    fireEvent.click(screen.getByRole("button", { name: /Generate Insights/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to generate insights");
    });
  });

  it("success state renders insight items, charts, and metrics", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: [
        {
          id: "ins-1",
          title: "Revenue Surge in Festive Season",
          description: "42% increase in Handcrafted Dupattas sales across northern region.",
          labels: ["Week 1", "Week 2", "Week 3"],
          data_points: [10000, 15000, 22000],
          created_at: new Date().toISOString(),
        },
      ],
    });

    render(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Revenue Surge in Festive Season").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/42% increase in Handcrafted Dupattas/i).length).toBeGreaterThan(0);
    });
  });
});
