import '@testing-library/jest-dom/vitest';

// Mock ResizeObserver for Recharts ResponsiveContainer in jsdom
if (typeof window !== 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
