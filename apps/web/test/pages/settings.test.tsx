import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsPage from "../../src/features/settings/SettingsPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("SettingsPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders settings sections and toggles", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: /Workspace Settings/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Operational Defaults/i })).toBeInTheDocument();
  });

  it("empty state handles empty settings response without crash", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { workspace_settings: {}, notifications: {} } });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Realtime dashboard refresh")).toBeInTheDocument();
    });
  });

  it("error state notifies on fetch failure and save failure", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network failed"));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load workspace settings");
    });

    vi.spyOn(api, "put").mockRejectedValueOnce(new Error("Save failed"));
    const saveBtn = screen.getByRole("button", { name: /^Save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to save settings");
    });
  });

  it("success state loads settings and saves updated preferences", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        workspace_settings: { realtime_dashboard_refresh: true, ai_assistant_enabled: true },
        notifications: { weekly_summary: true },
      },
    });
    vi.spyOn(api, "put").mockResolvedValueOnce({
      data: {
        workspace_settings: { realtime_dashboard_refresh: true, ai_assistant_enabled: true },
        notifications: { weekly_summary: true },
      },
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Realtime dashboard refresh")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Save$/i })).toBeEnabled();
    });

    const saveBtn = screen.getByRole("button", { name: /^Save$/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Settings updated");
    });
  });
});
