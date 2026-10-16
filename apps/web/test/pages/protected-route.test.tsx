import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../../src/components/ProtectedRoute";
import * as auth from "../../src/lib/auth";

describe("ProtectedRoute - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / unauthenticated initial state redirects to login", () => {
    vi.spyOn(auth, "isAuthenticated").mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Protected Dashboard</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page Target</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page Target")).toBeInTheDocument();
    expect(screen.queryByText("Protected Dashboard")).not.toBeInTheDocument();
  });

  it("empty session / no tokens state safely prevents child route render", () => {
    vi.spyOn(auth, "isAuthenticated").mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/bills/kacha"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/bills/kacha" element={<div>Secret Bills</div>} />
          </Route>
          <Route path="/login" element={<div>Login Required</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("Secret Bills")).not.toBeInTheDocument();
  });

  it("error state: expired token or corrupted state redirects safely to login", () => {
    vi.spyOn(auth, "isAuthenticated").mockImplementation(() => {
      return false;
    });

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/settings" element={<div>Settings Private</div>} />
          </Route>
          <Route path="/login" element={<div>Re-authenticate Login</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Re-authenticate Login")).toBeInTheDocument();
  });

  it("success state renders protected outlet when valid session exists", () => {
    vi.spyOn(auth, "isAuthenticated").mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Protected Dashboard Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Protected Dashboard Content")).toBeInTheDocument();
  });
});
