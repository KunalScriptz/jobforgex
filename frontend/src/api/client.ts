import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "";

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || "";
    const isAuthRequest = url.includes("/api/v1/auth/");

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);
          processQueue(null, data.access_token);
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          // Another tab may have refreshed and rotated the token — wait briefly
          // and retry once with the new token before giving up.
          await new Promise((r) => setTimeout(r, 600));
          const latestRefreshToken = localStorage.getItem("refresh_token");
          if (latestRefreshToken && latestRefreshToken !== refreshToken) {
            try {
              const { data } = await axios.post(`${API_BASE}/api/v1/auth/refresh`, {
                refresh_token: latestRefreshToken,
              });
              localStorage.setItem("access_token", data.access_token);
              localStorage.setItem("refresh_token", data.refresh_token);
              processQueue(null, data.access_token);
              originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
              return apiClient(originalRequest);
            } catch {
              // fall through to logout
            }
          }
          processQueue(refreshError, null);
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/auth";
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      isRefreshing = false;
      localStorage.removeItem("access_token");
      window.location.href = "/auth";
    }

    return Promise.reject(error);
  }
);

export default apiClient;
