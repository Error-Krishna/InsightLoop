import axios from "axios";
import { clearSession, getAccessToken, getRefreshToken, setSession, getCurrentUser } from "./auth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
});

// Dedicated axios instance for refresh calls (bypasses interceptors)
const refreshAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest?._retry && getRefreshToken()) {
      originalRequest._retry = true;
      try {
        const refreshResponse = await refreshAxios.post("/auth/refresh/", {
          refresh: getRefreshToken(),
        });
        setSession({
          access: refreshResponse.data.access,
          refresh: getRefreshToken(),
          user: getCurrentUser(),
        });
        originalRequest.headers.Authorization = `Bearer ${refreshResponse.data.access}`;
        return api(originalRequest);
      } catch {
        clearSession();
      }
    }
    return Promise.reject(error);
  },
);

export default api;
