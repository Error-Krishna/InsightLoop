import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { clearSession, getAccessToken, getRefreshToken, setSession, getCurrentUser } from "./auth";

const rawBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "/api/v1";
const defaultBaseUrl =
  rawBase.startsWith("http://") || rawBase.startsWith("https://")
    ? rawBase
    : typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null"
    ? rawBase
    : `http://localhost:5173${rawBase}`;

const api = axios.create({
  baseURL: defaultBaseUrl,
});

// Dedicated axios instance for refresh calls (bypasses interceptors to avoid infinite loops)
const refreshAxios = axios.create({
  baseURL: defaultBaseUrl,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight refresh token mutex
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function doRefreshToken(): Promise<string> {
  const refresh = getRefreshToken();
  if (!refresh) {
    clearSession();
    throw new Error("No refresh token available");
  }

  const response = await refreshAxios.post<{ access: string; refresh?: string }>("/auth/refresh/", { refresh });
  const newAccessToken: string = response.data.access;
  const newRefreshToken: string = response.data.refresh ?? refresh;

  setSession({
    access: newAccessToken,
    refresh: newRefreshToken,
    user: getCurrentUser(),
  });

  return newAccessToken;
}

function redirectToLogin() {
  if (typeof window !== "undefined" && window.location) {
    const currentPath = window.location.pathname + window.location.search;
    if (!currentPath.startsWith("/login")) {
      const next = encodeURIComponent(currentPath);
      window.location.replace(`/login?next=${next}`);
    }
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401) {
      if (originalRequest && !originalRequest._retry && getRefreshToken()) {
        originalRequest._retry = true;

        if (!isRefreshing) {
          isRefreshing = true;
          refreshPromise = doRefreshToken()
            .finally(() => {
              isRefreshing = false;
              refreshPromise = null;
            });
        }

        try {
          const newAccessToken = await refreshPromise;
          if (newAccessToken) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return await api(originalRequest);
          }
        } catch (refreshErr) {
          clearSession();
          redirectToLogin();
          return Promise.reject(refreshErr instanceof Error ? refreshErr : new Error(String(refreshErr)));
        }
      } else {
        clearSession();
        redirectToLogin();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
