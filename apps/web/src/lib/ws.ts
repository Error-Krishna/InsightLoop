export function buildWsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = import.meta.env.VITE_WS_BASE_URL ?? `${proto}//${window.location.host}`;
  return `${base}${path}`;
}
