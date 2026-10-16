import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProfilePage from "../../src/features/profile/ProfilePage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("ProfilePage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders page title and form inputs", () => {
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => {}));
    render(<ProfilePage />);
    expect(screen.getByRole("heading", { name: /Profile & Company Settings/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Profile/i })).toBeInTheDocument();
  });

  it("empty state handles empty profile data without crashing", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { user: {}, company: {} } });
    render(<ProfilePage />);

    await waitFor(() => {
      const contactInput = screen.getByLabelText(/Contact Name/i);
      expect(contactInput).toHaveValue("");
    });
  });

  it("error state handles load failure and save failure with error toasts", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("Network failed"));
    render(<ProfilePage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load profile");
    });

    vi.spyOn(api, "put").mockRejectedValueOnce(new Error("Save failed"));
    const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to update profile");
    });
  });

  it("success state loads user and company info, and submits update", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        user: { name: "Alice Admin" },
        company: {
          name: "Acme Textiles Pvt Ltd",
          address: "100 Industrial Area",
          email: "alice@acme.dev",
          phone: "9876543210",
          gst_number: "27AAAAA0000A1Z5",
        },
      },
    });
    vi.spyOn(api, "put").mockResolvedValueOnce({ data: { status: "ok" } });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alice Admin")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Acme Textiles Pvt Ltd")).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Profile updated");
    });
  });
});
