import { canAccessDriverApp, type AuthUser } from "@brewtracker/types";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";

import { supabase } from "../../lib/supabase";
import {
  getCurrentUserProfile,
  signInWithEmailAndPassword,
  signOut as signOutService,
  type SignInCredentials,
} from "./auth.service";

type AuthStatus =
  | "initializing"
  | "signed_out"
  | "loading_profile"
  | "authenticated"
  | "access_denied"
  | "error";

type AuthContextValue = {
  session: Session | null;
  profile: AuthUser | null;
  status: AuthStatus;
  errorMessage: string | null;
  signIn: (credentials: SignInCredentials) => Promise<void>;
  signOut: () => Promise<void>;
  retryProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadProfile = useCallback(
    async (currentSession: Session): Promise<void> => {
      setStatus("loading_profile");
      setErrorMessage(null);

      try {
        const userProfile = await getCurrentUserProfile(currentSession.user.id);

        setProfile(userProfile);

        if (!canAccessDriverApp(userProfile)) {
          setStatus("access_denied");
          return;
        }

        setStatus("authenticated");
      } catch (error) {
        setProfile(null);
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load your employee profile.",
        );
      }
    },
    [],
  );

  const applySession = useCallback(
    async (nextSession: Session | null): Promise<void> => {
      setSession(nextSession);

      if (!nextSession) {
        setProfile(null);
        setErrorMessage(null);
        setStatus("signed_out");
        return;
      }

      await loadProfile(nextSession);
    },
    [loadProfile],
  );

  useEffect(() => {
    let mounted = true;

    async function initializeAuthentication() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }

      await applySession(data.session);
    }

    void initializeAuthentication();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }

      void applySession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    if (AppState.currentState === "active") {
      supabase.auth.startAutoRefresh();
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const signIn = useCallback(async (credentials: SignInCredentials) => {
    setErrorMessage(null);
    await signInWithEmailAndPassword(credentials);
  }, []);

  const signOut = useCallback(async () => {
    await signOutService();

    setSession(null);
    setProfile(null);
    setErrorMessage(null);
    setStatus("signed_out");
  }, []);

  const retryProfile = useCallback(async () => {
    if (!session) {
      setStatus("signed_out");
      return;
    }

    await loadProfile(session);
  }, [loadProfile, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      status,
      errorMessage,
      signIn,
      signOut,
      retryProfile,
    }),
    [session, profile, status, errorMessage, signIn, signOut, retryProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
