import { useCallback, useEffect, useState } from "react";

import {
  loadTodayRoute,
  refreshTodayRoute,
} from "./route.service";
import type {
  RouteDataSource,
  TodayRoute,
} from "./route.types";

type UseTodayRouteResult = {
  route: TodayRoute | null;
  source: RouteDataSource;
  syncedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  errorMessage: string | null;
  warningMessage: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useTodayRoute(
  refreshKey: number,
): UseTodayRouteResult {
  const [route, setRoute] = useState<TodayRoute | null>(null);
  const [source, setSource] = useState<RouteDataSource>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  );
  const [warningMessage, setWarningMessage] = useState<string | null>(
    null,
  );

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await loadTodayRoute();

      setRoute(result.route);
      setSource(result.source);
      setSyncedAt(result.syncedAt);
      setWarningMessage(result.warningMessage);
    } catch (error) {
      setRoute(null);
      setSource(null);
      setSyncedAt(null);
      setWarningMessage(null);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load today's route.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    setErrorMessage(null);

    try {
      const result = await refreshTodayRoute();

      setRoute(result.route);
      setSource(result.source);
      setSyncedAt(result.syncedAt);
      setWarningMessage(result.warningMessage);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to refresh today's route.",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return {
    route,
    source,
    syncedAt,
    loading,
    refreshing,
    errorMessage,
    warningMessage,
    reload,
    refresh,
  };
}