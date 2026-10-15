export interface User {
  id: string;
  name: string;
  email: string;
  company_id: string;
  company_name?: string;
  role?: string;
}

export interface SessionData {
  access: string;
  refresh: string;
  user: User | null;
}

const ACCESS_KEY = "insightloop_access_token";
const REFRESH_KEY = "insightloop_refresh_token";
const USER_KEY = "insightloop_user";

export function setSession({ access, refresh, user }: SessionData): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function getCurrentUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "null") as User | null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function getCompanyId(): string {
  return getCurrentUser()?.company_id ?? "";
}
