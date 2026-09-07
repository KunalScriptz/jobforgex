import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi, AuthResponse, LoginData, RegisterData } from "@/api/auth";

/** Decode a base64url JWT payload, returning null on any parse failure. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    // base64url → base64 (char replacement + padding)
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    // Handle UTF-8 in the payload
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Build the AuthUser shape from a decoded access token, or null if unusable. */
function userFromToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.sub) return null;
  return {
    id: payload.sub as string,
    email: (payload.email as string) ?? "",
    full_name: null,
    email_verified: true,
    role: (payload.role as string) || "user",
    workspace_id: (payload.workspace_id as string) || null,
    workspace_name: null,
  };
}

interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  email_verified: boolean;
  role: string;
  workspace_id: string | null;
  workspace_name: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginData) => Promise<AuthResponse>;
  register: (data: RegisterData) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Single-flight boot refresh — React StrictMode double-mounts effects in dev,
// and two parallel refreshes with the same token would 401 on rotation.
let bootRefreshPromise: Promise<{ access_token: string; refresh_token: string }> | null = null;

function refreshSession(refreshToken: string) {
  if (!bootRefreshPromise) {
    bootRefreshPromise = authApi.refresh(refreshToken).finally(() => {
      bootRefreshPromise = null;
    });
  }
  return bootRefreshPromise;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const token = localStorage.getItem("access_token");
    const payload = token ? decodeJwtPayload(token) : null;
    const tokenValid =
      payload && payload.sub && (!payload.exp || (payload.exp as number) * 1000 > Date.now());

    if (token && tokenValid) {
      setUser(userFromToken(token));
      setIsLoading(false);
      return;
    }

    // Token missing or expired — try to refresh the session before giving up.
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      if (token) localStorage.removeItem("access_token");
      setIsLoading(false);
      return;
    }

    refreshSession(refreshToken)
      .then(({ access_token, refresh_token }) => {
        if (cancelled) return;
        localStorage.setItem("access_token", access_token);
        localStorage.setItem("refresh_token", refresh_token);
        setUser(userFromToken(access_token));
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (data: LoginData) => {
    const res = await authApi.login(data);
    localStorage.setItem("access_token", res.access_token);
    localStorage.setItem("refresh_token", res.refresh_token);
    setUser(res.user);
    return res;
  };

  const register = async (data: RegisterData) => {
    const res = await authApi.register(data);
    localStorage.setItem("access_token", res.access_token);
    localStorage.setItem("refresh_token", res.refresh_token);
    setUser(res.user);
    return res;
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {});
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  };

  const refreshUser = async () => {
    const tokenPayload = localStorage.getItem("access_token");
    if (tokenPayload) {
      const user = userFromToken(tokenPayload);
      if (user) setUser(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
