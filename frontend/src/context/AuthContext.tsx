import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "../lib/api";
import { beginPasskeyLogin } from "../lib/passkeys";
import { clearTokens, setAccessToken, setRefreshToken } from "../lib/storage";
import type { AuthPayload, AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthPayload>;
  loginWithPasskey: (email?: string) => Promise<AuthPayload>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode } ) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async (): Promise<void> => {
    const response = await authApi.get("/auth/me");
    const data = response.data as {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      publicAlias: string;
      publicCode: string;
      emailConfirmed: boolean;
      mustChangePassword: boolean;
      profileImageUrl?: string;
      passkeyCount: number;
      roles: string[];
    };

    setUser({
      id: data.id,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      publicAlias: data.publicAlias,
      publicCode: data.publicCode,
      emailConfirmed: data.emailConfirmed,
      mustChangePassword: data.mustChangePassword,
      profileImageUrl: data.profileImageUrl,
      passkeyCount: data.passkeyCount ?? 0,
      roles: data.roles
    });
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await refreshProfile();
      } catch {
        clearTokens();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    bootstrap().catch(() => {
      setLoading(false);
    });
  }, []);

  const login = async (email: string, password: string): Promise<AuthPayload> => {
    const response = await authApi.post("/auth/login", { email, password });
    const payload = response.data as AuthPayload;

    setAccessToken(payload.accessToken);
    setRefreshToken(payload.refreshToken);

    await refreshProfile();

    return payload;
  };

  const loginWithPasskey = async (email?: string): Promise<AuthPayload> => {
    const payload = await beginPasskeyLogin(email);

    setAccessToken(payload.accessToken);
    setRefreshToken(payload.refreshToken);

    await refreshProfile();

    return payload;
  };

  const logout = async (): Promise<void> => {
    try {
      await authApi.post("/auth/logout", {
        refreshToken: localStorage.getItem("hablamas_refresh_token")
      });
    } catch {
      // best effort logout
    }

    clearTokens();
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      loginWithPasskey,
      logout,
      refreshProfile
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

