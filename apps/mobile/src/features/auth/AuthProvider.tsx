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
  useRef,
} from "react";
import { AppState } from "react-native";

import { supabase } from "../../lib/supabase";
import {
  getCurrentUserProfile,
  isAuthNetworkError,
  signInWithEmailAndPassword,
  signOut as signOutService,
  type SignInCredentials,
} from "./auth.service";
import { removeCachedProfile } from "./auth-profile-cache.service";

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
  const profileRequestRef = useRef(0);

  const loadProfile = useCallback(
    async (currentSession: Session): Promise<void> => {
      const requestId = ++profileRequestRef.current;

      setStatus("loading_profile");
      setErrorMessage(null);

      try {
        const userProfile = await getCurrentUserProfile(
          currentSession.user.id,
        );

        if (requestId !== profileRequestRef.current) {
          return;
        }

        setProfile(userProfile);

        setStatus(
          canAccessDriverApp(userProfile)
            ? "authenticated"
            : "access_denied",
        );
      } catch (error) {
        if (requestId !== profileRequestRef.current) {
          return;
        }

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
        profileRequestRef.current += 1;

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

        setErrorMessage(
          isAuthNetworkError(error)
            ? "Unable to restore your session offline. Connect to the internet and try again."
            : "Unable to restore your session. Please sign in again.",
        );

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

  useEffect(() => {
    if (!session || status !== "authenticated") {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const userId = session.user.id;

    async function revalidateProfile(): Promise<void> {
      if (
        cancelled ||
        inFlight ||
        AppState.currentState !== "active"
      ) {
        return;
      }

      inFlight = true;

      const requestId = profileRequestRef.current;

      try {
        const userProfile = await getCurrentUserProfile(userId, {
          allowCached: false,
        });

        if (
          cancelled ||
          requestId !== profileRequestRef.current
        ) {
          return;
        }

        setProfile(userProfile);
        setErrorMessage(null);

        if (!canAccessDriverApp(userProfile)) {
          setStatus("access_denied");
        }
      } catch (error) {
        if (
          cancelled ||
          requestId !== profileRequestRef.current
        ) {
          return;
        }

        // Keep the last known profile during a connection failure.
        if (isAuthNetworkError(error)) {
          return;
        }

        setProfile(null);
        setStatus("error");

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to verify your employee profile.",
        );
      } finally {
        inFlight = false;
      }
    }

    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          void revalidateProfile();
        }
      },
    );

    const timer = setInterval(() => {
      void revalidateProfile();
    }, 30_000);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(timer);
    };
  }, [session?.user.id, status]);

  const signIn = useCallback(async (credentials: SignInCredentials) => {
    setErrorMessage(null);
    await signInWithEmailAndPassword(credentials);
  }, []);

  const signOut = useCallback(async () => {
    const userId = session?.user.id;

    await signOutService();

    profileRequestRef.current += 1;

    if (userId) {
      await removeCachedProfile(userId);
    }

    setSession(null);
    setProfile(null);
    setErrorMessage(null);
    setStatus("signed_out");
  }, [session?.user.id]);

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
