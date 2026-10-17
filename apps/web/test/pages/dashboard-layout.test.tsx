import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import DashboardLayout from "../../src/features/dashboard/DashboardLayout";
import * as auth from "../../src/lib/auth";

describe("DashboardLayout - Lifecycle States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loading / initial state renders navigation sidebar, header, and user avatar", () => {
    vi.spyOn(auth, "getCurrentUser").mockReturnValue({
      id: "u-1",
      email: "alice@company-a.com",
      name: "Alice Admin",
      company_id: "c-1",
      company_name: "Acme Textiles",
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div>Dashboard Child Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText("InsightLoop").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alice Admin").length).toBeGreaterThan(0);
    expect(screen.getByText("Dashboard Child Content")).toBeInTheDocument();
  });

  it("empty state handles anonymous / null user gracefully", () => {
    vi.spyOn(auth, "getCurrentUser").mockReturnValue(null);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div>Empty User Child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText("Company").length).toBeGreaterThan(0);
    expect(screen.getByText("Empty User Child")).toBeInTheDocument();
  });

  it("error state handles logout action safely", () => {
    const clearSpy = vi.spyOn(auth, "clearSession");
    vi.spyOn(auth, "getCurrentUser").mockReturnValue({
      id: "u-1",
      email: "alice@company-a.com",
      name: "Alice Admin",
      company_id: "c-1",
      company_name: "Acme Textiles",
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div>Child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const logoutButtons = screen.getAllByRole("button", { name: /Log out/i });
    fireEvent.click(logoutButtons[0]);

    expect(clearSpy).toHaveBeenCalled();
  });

  it("success state renders sub-navigation and child route outlets", () => {
    vi.spyOn(auth, "getCurrentUser").mockReturnValue({
      id: "u-1",
      email: "alice@company-a.com",
      name: "Alice Admin",
      company_id: "c-1",
      company_name: "Acme Textiles",
    });


    render(
      <MemoryRouter initialEntries={["/bills/kacha"]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/bills/kacha" element={<div>Active Bill Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Active Bill Page")).toBeInTheDocument();
    expect(screen.getAllByText("Bills").length).toBeGreaterThan(0);
  });
});
