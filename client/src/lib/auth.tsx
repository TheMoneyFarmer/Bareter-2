import { createContext, useContext, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn, storeMobileToken, clearMobileToken } from "./queryClient";
import type { User, SocialProfile } from "@shared/schema";
import { identifyUser, resetIdentity } from "./posthog";
import { Capacitor } from "@capacitor/core";

interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  country?: string;
  city?: string;
  signupType?: string;
  socialProfiles?: SocialProfile[];
  inviteCode?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ onInternationalWaitlist?: boolean }>;
  logout: () => Promise<void>;
  refetch: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    // The global default is staleTime: Infinity, which means a dead session
    // would never be re-detected and the UI would keep looking logged in.
    // Re-verify the session periodically and when the tab regains focus so
    // stale auth state self-heals before the user hits a protected action.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      return res.json();
    },
    onSuccess: async (userData: any) => {
      // Extract and store mobile bearer token when issued (native app path only).
      // Strip it from the cached user object so it never leaks into the UI layer.
      const { mobileToken, ...user } = userData;
      if (mobileToken) await storeMobileToken(mobileToken);
      // Set cache immediately from login response — no round-trip needed.
      queryClient.setQueryData(["/api/auth/me"], user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: async (userData: any) => {
      const { mobileToken, ...user } = userData;
      if (mobileToken) await storeMobileToken(mobileToken);
      queryClient.setQueryData(["/api/auth/me"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout", {});
      await clearMobileToken();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  // Sync PostHog identity whenever the auth state changes.
  // identifyUser/resetIdentity are no-ops when VITE_POSTHOG_KEY is absent.
  useEffect(() => {
    if (user?.id) {
      void identifyUser(user.id);
    } else if (user === null) {
      resetIdentity();
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const register = async (data: RegisterData): Promise<{ onInternationalWaitlist?: boolean }> => {
    const result = await registerMutation.mutateAsync(data);
    return { onInternationalWaitlist: !!(result as any)?.onInternationalWaitlist };
  };

  const logout = async () => {
    // Remove device push token before logging out so no stale pushes hit this device
    if (Capacitor.isNativePlatform()) {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const token = await new Promise<string | null>((resolve) => {
          PushNotifications.addListener("registration", (t) => resolve(t.value)).catch(() => resolve(null));
          // Fallback — if registration doesn't fire, resolve null
          setTimeout(() => resolve(null), 1000);
        });
        if (token) {
          await apiRequest("DELETE", "/api/push/native-token", { token }).catch(() => {});
        } else {
          await apiRequest("DELETE", "/api/push/native-token", {}).catch(() => {});
        }
      } catch {}
    }
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, register, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
