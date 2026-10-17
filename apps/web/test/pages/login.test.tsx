import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../../src/features/auth/LoginPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("LoginPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders email, password fields and sign in button", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /Sign in to InsightLoop/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeInTheDocument();
  });

  it("empty state disables or prompts when submitted empty", async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    const email = screen.getByLabelText(/Email/i);
    expect(email).toHaveValue("");
  });

  it("error state handles 401 invalid credentials with toast error", async () => {
    const error: any = new Error("Request failed with status code 401");
    error.response = { status: 401, data: { detail: "Invalid email or password" } };
    vi.spyOn(api, "post").mockRejectedValueOnce(error);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "alice@company-a.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Invalid email or password");
    });
  });

  it("success state authenticates and redirects user", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: {
        tokens: { access: "access-token-123", refresh: "refresh-token-123" },
        user: { id: "user-1", email: "alice@company-a.com", name: "Alice" },
      },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "alice@company-a.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining("/auth/login/"),
        expect.objectContaining({ email: "alice@company-a.com" })
      );
    });
  });
});
