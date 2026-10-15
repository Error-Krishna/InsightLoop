export function buildWsUrl(path: string): string {
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:4000';
  const base = import.meta.env?.VITE_WS_BASE_URL ?? `${proto}//${host}`;
  return `${base}${path}`;
}

export type WsEventListener = (...args: unknown[]) => void;

export interface WebSocketClientOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxRetries?: number;
  protocols?: string | string[];
}

export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private options: Required<WebSocketClientOptions>;
  private retryCount = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private explicitlyClosed = false;
  private messageQueue: string[] = [];
  private listeners = new Map<string, Set<WsEventListener>>();

  constructor(urlOrPath: string, options: WebSocketClientOptions = {}) {
    this.url = urlOrPath.startsWith('ws://') || urlOrPath.startsWith('wss://')
      ? urlOrPath
      : buildWsUrl(urlOrPath);
    this.options = {
      initialDelayMs: options.initialDelayMs ?? 1000,
      maxDelayMs: options.maxDelayMs ?? 30000,
      maxRetries: options.maxRetries ?? Infinity,
      protocols: options.protocols ?? [],
    };
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.explicitlyClosed = false;
    this.clearReconnectTimeout();

    try {
      this.ws = new WebSocket(this.url, this.options.protocols);
    } catch (err) {
      this.emit('error', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = (event) => {
      this.retryCount = 0;
      this.flushQueue();
      this.emit('open', event);
    };

    this.ws.onmessage = (event) => {
      this.emit('message', event);
    };

    this.ws.onerror = (event) => {
      this.emit('error', event);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.emit('close', event);

      // Stop reconnecting on 4001 (auth failed / user deleted)
      if (event.code === 4001) {
        this.clearReconnectTimeout();
        return;
      }

      if (!this.explicitlyClosed) {
        this.scheduleReconnect();
      }
    };
  }

  public send(data: string | object): void {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
    } else {
      this.messageQueue.push(serialized);
    }
  }

  public reconnect(): void {
    this.retryCount = 0;
    this.clearReconnectTimeout();
    if (this.ws) {
      this.explicitlyClosed = true;
      this.ws.close();
    }
    this.connect();
  }

  public close(code?: number, reason?: string): void {
    this.explicitlyClosed = true;
    this.clearReconnectTimeout();
    if (this.ws) {
      this.ws.close(code, reason);
      this.ws = null;
    }
  }

  public get readyState(): number {
    return this.ws ? this.ws.readyState : (typeof WebSocket !== 'undefined' ? WebSocket.CLOSED : 3);
  }

  public get queueLength(): number {
    return this.messageQueue.length;
  }

  public on(event: string, callback: WsEventListener): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  public off(event: string, callback: WsEventListener): this {
    this.listeners.get(event)?.delete(callback);
    return this;
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Error in WebSocket listener for ${event}:`, err);
      }
    });
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift();
      if (msg) this.ws.send(msg);
    }
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= this.options.maxRetries) return;

    const baseDelay = this.options.initialDelayMs * Math.pow(2, this.retryCount);
    const delay = Math.min(baseDelay, this.options.maxDelayMs);
    this.retryCount++;

    this.clearReconnectTimeout();
    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }
}
