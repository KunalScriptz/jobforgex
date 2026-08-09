import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi, AuthResponse, LoginData, RegisterData } from "@/api/auth";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUser({
          id: payload.sub,
          email: payload.email,
          full_name: null,
          email_verified: true,
          role: payload.role || "user",
          workspace_id: payload.workspace_id || null,
          workspace_name: null,
        });
      } catch {
        // token invalid
      }
    }
    setIsLoading(false);
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
      try {
        const payload = JSON.parse(atob(tokenPayload.split(".")[1]));
        setUser({
          id: payload.sub,
          email: payload.email,
          full_name: null,
          email_verified: true,
          role: payload.role || "user",
          workspace_id: payload.workspace_id || null,
          workspace_name: null,
        });
      } catch {}
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
