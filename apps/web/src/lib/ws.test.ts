import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from './ws';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  protocols?: string | string[];
  readyState = 0; // CONNECTING
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose({ code, reason, wasClean: true } as unknown as CloseEvent);
    }
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) {
      this.onopen({} as unknown as Event);
    }
  }

  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage({ data } as unknown as MessageEvent);
    }
  }
}

describe('apps/web ws.ts WebSocketClient Hardening', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('queues messages sent before open and flushes them on open', () => {
    const client = new WebSocketClient('ws://localhost:4000/ws/dashboard/');
    client.connect();

    const mockWs = MockWebSocket.instances[0];
    expect(mockWs).toBeDefined();

    // Send while CONNECTING
    client.send({ action: 'subscribe' });
    client.send('ping');
    expect(client.queueLength).toBe(2);
    expect(mockWs.sentMessages.length).toBe(0);

    // Simulate open
    mockWs.simulateOpen();
    expect(client.queueLength).toBe(0);
    expect(mockWs.sentMessages).toEqual([JSON.stringify({ action: 'subscribe' }), 'ping']);
  });

  it('stops reconnecting when closed with code 4001', () => {
    const client = new WebSocketClient('ws://localhost:4000/ws/ai-assistant/', {
      initialDelayMs: 500,
    });
    client.connect();

    const mockWs = MockWebSocket.instances[0];
    mockWs.simulateOpen();

    // Close with 4001 (auth failure)
    mockWs.close(4001, 'User deleted');

    // Advance timers
    vi.advanceTimersByTime(5000);

    // Should NOT have created a new WebSocket instance
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('reconnects with exponential backoff on normal disconnects', () => {
    const client = new WebSocketClient('ws://localhost:4000/ws/dashboard/', {
      initialDelayMs: 1000,
      maxDelayMs: 5000,
    });
    client.connect();
    expect(MockWebSocket.instances.length).toBe(1);

    // First disconnect (e.g. 1006 abnormal)
    MockWebSocket.instances[0].close(1006, 'Abnormal Closure');
    expect(MockWebSocket.instances.length).toBe(1);

    // Advance 999ms -> not yet reconnected
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances.length).toBe(1);

    // Advance to 1000ms -> first retry
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(2);

    // Second disconnect -> delay is 2000ms
    MockWebSocket.instances[1].close(1006, 'Abnormal Closure');
    vi.advanceTimersByTime(1500);
    expect(MockWebSocket.instances.length).toBe(2);

    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances.length).toBe(3);
  });

  it('exposes a reconnect() method that immediately forces a new connection', () => {
    const client = new WebSocketClient('ws://localhost:4000/ws/dashboard/');
    client.connect();
    expect(MockWebSocket.instances.length).toBe(1);

    client.reconnect();
    expect(MockWebSocket.instances.length).toBe(2);
  });
});
