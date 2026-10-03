import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { InferResponseType } from "hono/client";
import type { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { currentUserQuery, sessionQuery } from "@/lib/session";

type AuthModalMode = "signIn";

interface AuthModalState {
  isOpen: boolean;
  mode: AuthModalMode;
  message?: string;
}

type User = InferResponseType<typeof api.users.me.$get, 200>;

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  modalState: AuthModalState;
  openAuthModal: (mode?: AuthModalMode, message?: string) => void;
  closeAuthModal: () => void;
  requireAuth: (action: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession();
  const isAuthenticated = !!session?.user;

  const { data: user, isLoading: userLoading } = useQuery({
    ...currentUserQuery,
    enabled: isAuthenticated,
  });

  // Route guards read the session from the query cache; keep it current.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!sessionPending) queryClient.setQueryData(sessionQuery.queryKey, session ?? null);
  }, [queryClient, session, sessionPending]);

  // A pack reads differently signed in (whether you liked it, what you may
  // see), so cached packs are refetched when the account changes.
  const accountId = session?.user.id;
  const previousAccount = useRef(accountId);
  useEffect(() => {
    if (sessionPending || previousAccount.current === accountId) return;
    previousAccount.current = accountId;
    void queryClient.invalidateQueries({ queryKey: ["pack"] });
  }, [accountId, queryClient, sessionPending]);

  const [modalState, setModalState] = useState<AuthModalState>({
    isOpen: false,
    mode: "signIn",
    message: undefined,
  });

  const isLoading = sessionPending || (isAuthenticated && userLoading);

  const openAuthModal = useCallback((mode: AuthModalMode = "signIn", message?: string) => {
    setModalState({ isOpen: true, mode, message });
  }, []);

  const closeAuthModal = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const requireAuth = useCallback(
    (action: string): boolean => {
      if (isAuthenticated) {
        return true;
      }
      openAuthModal("signIn", `Sign in to ${action}`);
      return false;
    },
    [isAuthenticated, openAuthModal]
  );

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        isAuthenticated,
        modalState,
        openAuthModal,
        closeAuthModal,
        requireAuth,
      }}
    >
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
