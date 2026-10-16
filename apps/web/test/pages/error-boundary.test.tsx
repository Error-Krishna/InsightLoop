import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { getErrorMessage, showErrorToast } from "../../src/lib/error";
import { AxiosError, AxiosHeaders } from "axios";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function FaultyComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Simulated rendering explosion");
  }
  return <div>Component Rendered Successfully</div>;
}

function StatefulFaultyComponent() {
  const [explode, setExplode] = useState(true);
  if (explode) {
    throw new Error("Dynamic page explosion");
  }
  return <div>Recovered Successfully</div>;
}

describe("ErrorBoundary & Unified Error-Message Convention", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <FaultyComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Component Rendered Successfully")).toBeInTheDocument();
  });

  it("catches rendering errors and displays accessible error UI", () => {
    // Suppress console.error in vitest output for intentional error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <FaultyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Simulated rendering explosion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();

    spy.mockRestore();
  });

  it("supports custom fallback components", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom Error Fallback</div>}>
        <FaultyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom Error Fallback")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("resetError recovers when error condition resolves", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    let throwError = true;
    function DynamicThrower() {
      if (throwError) throw new Error("Temporary failure");
      return <div>Clean Recovery</div>;
    }

    render(
      <ErrorBoundary>
        <DynamicThrower />
      </ErrorBoundary>
    );

    expect(screen.getByText("Temporary failure")).toBeInTheDocument();

    throwError = false;
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

    expect(screen.getByText("Clean Recovery")).toBeInTheDocument();
    spy.mockRestore();
  });

  describe("Unified Error Convention (getErrorMessage & showErrorToast)", () => {
    it("extracts detail from DRF-style error objects", () => {
      const axiosErr = new AxiosError("Request failed", "400", undefined, undefined, {
        data: { detail: "Company GST number is invalid." },
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: { headers: new AxiosHeaders() },
      });

      const message = getErrorMessage(axiosErr);
      expect(message).toBe("Company GST number is invalid.");
    });

    it("extracts message or error from standard response bodies", () => {
      const axiosErr1 = new AxiosError("Request failed", "400", undefined, undefined, {
        data: { message: "Item SKU collision" },
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
      expect(getErrorMessage(axiosErr1)).toBe("Item SKU collision");

      const axiosErr2 = new AxiosError("Request failed", "400", undefined, undefined, {
        data: { error: "Authentication expired" },
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
      expect(getErrorMessage(axiosErr2)).toBe("Authentication expired");
    });

    it("falls back to standard message or fallback default", () => {
      expect(getErrorMessage(null, "Default error")).toBe("Default error");
      expect(getErrorMessage(new Error("Generic JS error"))).toBe("Generic JS error");
      expect(getErrorMessage("String error message")).toBe("String error message");
    });

    it("showErrorToast invokes toast.error with extracted message", () => {
      showErrorToast(new Error("Custom notification failure"));
      expect(toast.error).toHaveBeenCalledWith("Custom notification failure");
    });
  });
});
