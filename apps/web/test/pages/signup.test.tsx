import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SignupPage from "../../src/features/auth/SignupPage";
import api from "../../src/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("SignupPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders signup form inputs", () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /Start your free trial/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Company/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Account/i })).toBeInTheDocument();
  });

  it("empty state ensures inputs start empty", () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/Full Name/i)).toHaveValue("");
    expect(screen.getByLabelText(/Email/i)).toHaveValue("");
    expect(screen.getByLabelText(/Company/i)).toHaveValue("");
    expect(screen.getByLabelText(/Password/i)).toHaveValue("");
  });

  it("error state handles signup conflict (email already in use)", async () => {
    const error: any = new Error("Request failed with status code 409");
    error.response = { status: 409, data: { detail: "A user with this email already exists" } };
    vi.spyOn(api, "post").mockRejectedValueOnce(error);

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "New User" } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "existing@example.com" } });
    fireEvent.change(screen.getByLabelText(/Company/i), { target: { value: "Corp" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("A user with this email already exists");
    });
  });

  it("success state creates user account and signs in", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: {
        tokens: { access: "access-token-new", refresh: "refresh-token-new" },
        user: { id: "user-new", email: "new@example.com", name: "New User" },
      },
    });

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "New User" } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText(/Company/i), { target: { value: "New Corp" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining("/auth/signup/"),
        expect.objectContaining({ email: "new@example.com" })
      );
    });
  });
});
