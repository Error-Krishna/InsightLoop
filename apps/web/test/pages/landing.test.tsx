import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../../src/features/landing/LandingPage";

describe("LandingPage - Lifecycle States", () => {
  it("loading / initial state renders hero headline, badge, and value proposition", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Enterprise operations, modern analytics")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /The Analytics & Operations Platform for Modern Businesses/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Real-time insights, smart billing, inventory control/i)).toBeInTheDocument();
  });

  it("empty / feature state renders all 6 platform capability cards", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getAllByRole("heading", { name: "Analytics Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "Kacha/Pakka Bills" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "Inventory Management" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "AI Assistant" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "Worker Management" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "Data Export" }).length).toBeGreaterThan(0);
  });

  it("empty / error / fallback state renders gracefully without crashing", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  it("pricing state renders Free, Pro, and Enterprise subscription tiers", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Free" })).toBeInTheDocument();
    expect(screen.getByText("₹0")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Pro" })).toBeInTheDocument();
    expect(screen.getByText("₹499/mo")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Enterprise" })).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("success state renders actionable navigation links to signup and login", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    const trialLink = screen.getByRole("link", { name: /Start Free Trial/i });
    expect(trialLink).toHaveAttribute("href", "/signup");

    const signInLink = screen.getByRole("link", { name: /Sign In/i });
    expect(signInLink).toHaveAttribute("href", "/login");
  });
});
