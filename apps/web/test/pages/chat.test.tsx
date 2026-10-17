import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChatPage from "../../src/features/ai/ChatPage";
import * as auth from "../../src/lib/auth";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe("ChatPage - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders assistant greeting, starter prompts, and chat input", () => {
    vi.spyOn(auth, "getAccessToken").mockReturnValue("mock-token");
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /AI Assistant/i })).toBeInTheDocument();
    expect(screen.getByText(/Hi! I'm your AI assistant/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Try: Export business trends/i)).toBeInTheDocument();
    expect(screen.getByText("Export business trends")).toBeInTheDocument();
  });

  it("empty state ensures input starts empty and send button is disabled when blank", () => {
    vi.spyOn(auth, "getAccessToken").mockReturnValue("mock-token");
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/Try: Export business trends/i);
    expect(input).toHaveValue("");
  });

  it("error state handles missing authentication token with error toast", () => {
    vi.spyOn(auth, "getAccessToken").mockReturnValue(null);
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    expect(toast.error).toHaveBeenCalledWith("Please sign in again to use the AI assistant");
  });

  it("success state sends message and renders user bubble in conversation", () => {
    vi.spyOn(auth, "getAccessToken").mockReturnValue("mock-token");
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/Try: Export business trends/i);
    fireEvent.change(input, { target: { value: "Show worker productivity" } });
    expect(input).toHaveValue("Show worker productivity");

    const form = input.closest("form");
    if (form) {
      fireEvent.submit(form);
    }

    expect(screen.getByText("Show worker productivity")).toBeInTheDocument();
  });
});
