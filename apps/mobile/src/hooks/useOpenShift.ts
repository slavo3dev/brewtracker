import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { loadShiftSnapshot } from "../../src/features/time-clock/time-clock-cache.service";
import { getOpenTimeEntry } from "../../src/features/time-clock/time-clock.service";
import type { TimeEntry } from "../../src/features/time-clock/time-clock.types";

type ShiftState = {
  userId: string | null;
  entry: TimeEntry | null;
  known: boolean;
  loading: boolean;
  stale: boolean;
  error: string | null;
};

function initialState(userId: string | null): ShiftState {
  return {
    userId,
    entry: null,
    known: false,
    loading: true,
    stale: false,
    error: null,
  };
}

export function useOpenShift(
  userId: string | null,
  refreshKey: number,
) {
  const [state, setState] = useState<ShiftState>(() =>
    initialState(userId),
  );

  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const invalidateRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let generation = 0;
    let needsRefresh = true;

    setState(initialState(userId));

    if (!userId) {
      setState({
        ...initialState(null),
        loading: false,
      });
      return;
    }

    const currentUserId = userId;

    async function refresh(): Promise<void> {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      const requestGeneration = generation;

      try {
        const entry = await getOpenTimeEntry();

        if (cancelled || requestGeneration !== generation) {
          return;
        }

        needsRefresh = false;

        setState({
          userId: currentUserId,
          entry,
          known: true,
          loading: false,
          stale: false,
          error: null,
        });
      } catch {
        if (cancelled || requestGeneration !== generation) {
          return;
        }

        needsRefresh = true;

        setState((current) => ({
          ...current,
          loading: false,
          stale: true,
          error:
            "Unable to refresh your shift. Check your connection. " +
            "The app will retry automatically.",
        }));
      } finally {
        inFlight = false;
      }
    }

    refreshRef.current = refresh;

    invalidateRef.current = () => {
      generation += 1;
      needsRefresh = true;
    };

    async function restore(): Promise<void> {
      const snapshot = await loadShiftSnapshot(currentUserId);

      if (cancelled) {
        return;
      }

      if (snapshot) {
        setState({
          userId: currentUserId,
          entry: snapshot.entry,
          known: true,
          loading: false,
          stale: true,
          error: null,
        });
      }

      await refresh();
    }

    void restore();

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refresh();
      }
    });

    const timer = setInterval(() => {
      if (AppState.currentState === "active" && needsRefresh) {
        void refresh();
      }
    }, 15_000);

    return () => {
      cancelled = true;
      generation += 1;
      clearInterval(timer);
      subscription.remove();
      refreshRef.current = async () => {};
      invalidateRef.current = () => {};
    };
  }, [userId, refreshKey]);

  const refresh = useCallback(async (): Promise<void> => {
    await refreshRef.current();
  }, []);

  const markClockedOut = useCallback((): void => {
    // Ignore any older refresh that was started before clock-out.
    invalidateRef.current();

    setState({
      userId,
      entry: null,
      known: true,
      loading: false,
      stale: false,
      error: null,
    });
  }, [userId]);

  // Never expose a previous user's shift during an account change.
  const visibleState =
    state.userId === userId ? state : initialState(userId);

  return {
    openEntry: visibleState.entry,
    loadingEntry: visibleState.loading,
    shiftKnown: visibleState.known,
    shiftStale: visibleState.stale,
    shiftError: visibleState.error,
    refresh,
    markClockedOut,
  };
}