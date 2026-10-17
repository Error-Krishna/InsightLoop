import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import MetricCard from '../src/components/MetricCard';
import Card from '../src/components/Card';
import LoginPage from '../src/features/auth/LoginPage';
import { getAccessToken, getCurrentUser, clearSession } from '../src/lib/auth';
import api from '../src/lib/api';

// Golden Master Fixture import from Phase 1
import loginSuccessFixture from '../../api/test/contracts/fixtures/endpoints/auth/login_success_company_a.json';

const server = setupServer(
  http.post('*/auth/login/*', async () => {
    // Return the golden master structure
    return HttpResponse.json({
      tokens: {
        access: 'mock-valid-jwt-access-token',
        refresh: 'mock-valid-jwt-refresh-token',
      },
      user: {
        ...loginSuccessFixture.body.user,
        id: '6ad100f47f31c95cf587b543',
        company_id: '792f6b0d-ad97-404c-9e49-20ad50561e3f',
      },
    });
  })
);

describe('Frontend Component RTL & Golden Fixture Integration Suite', () => {
  beforeEach(() => {
    server.listen();
    clearSession();
  });

  afterEach(() => {
    server.close();
    clearSession();
  });

  it('renders MetricCard with positive trend, data points, and accessible text', () => {
    render(
      <MetricCard
        title="Total Revenue"
        value="₹1,24,500"
        trend={12.5}
        data={[{ value: 100 }, { value: 150 }, { value: 200 }]}
      />
    );

    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('₹1,24,500')).toBeInTheDocument();
    expect(screen.getByText(/▲ 12.5%/)).toBeInTheDocument();
  });

  it('renders MetricCard with negative trend indicator', () => {
    render(
      <MetricCard
        title="Wastage Rate"
        value="8.4%"
        trend={-3.2}
      />
    );

    expect(screen.getByText('Wastage Rate')).toBeInTheDocument();
    expect(screen.getByText('8.4%')).toBeInTheDocument();
    expect(screen.getByText(/▼ 3.2%/)).toBeInTheDocument();
  });

  it('renders Card container with children and custom class name', () => {
    render(
      <Card className="custom-test-class">
        <p>Card Content Test</p>
      </Card>
    );

    const content = screen.getByText('Card Content Test');
    expect(content).toBeInTheDocument();
  });

  it('executes user login flow in LoginPage, updates session, and navigates', async () => {
    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        tokens: {
          access: 'mock-valid-jwt-access-token',
          refresh: 'mock-valid-jwt-refresh-token',
        },
        user: {
          ...loginSuccessFixture.body.user,
          id: '6ad100f47f31c95cf587b543',
          company_id: '792f6b0d-ad97-404c-9e49-20ad50561e3f',
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard Home View</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Fill in credentials
    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign in/i });

    fireEvent.change(emailInput, { target: { value: 'alice@company-a.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    // Verify successful authentication and redirection
    await waitFor(() => {
      expect(screen.getByText('Dashboard Home View')).toBeInTheDocument();
    });

    // Verify stored auth session
    expect(getAccessToken()).toBe('mock-valid-jwt-access-token');
    const user = getCurrentUser();
    expect(user?.name).toBe('Alice Admin');
    expect(user?.email).toBe('alice@company-a.com');
  });
});
