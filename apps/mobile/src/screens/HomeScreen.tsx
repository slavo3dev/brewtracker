import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../features/auth/AuthProvider";
import TodayRouteCard from "../features/routes/TodayRouteCard";
import type { TodayRouteStop } from "../features/routes/route.types";
import { useTodayRoute } from "../features/routes/useTodayRoute";
import {
  clockOut,
  getOpenTimeEntry,
} from "../features/time-clock/time-clock.service";
import {
  hasCompletedClockInSelfie,
  requiresClockInSelfie,
  type TimeEntry,
} from "../features/time-clock/time-clock.types";

type Props = {
  onClockInPress: () => void;
  onResumeSelfie: (timeEntryId: string) => void;
  refreshKey: number;
  onStopPress?: (routeId: string, stop: TodayRouteStop) => void;
};

function formatClockTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function HomeScreen({
  onClockInPress,
  onResumeSelfie,
  refreshKey,
  onStopPress,
}: Props) {
  const { profile, signOut } = useAuth();

  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [clockingOut, setClockingOut] = useState(false);
  const [timeClockError, setTimeClockError] = useState<string | null>(null);

  const {
    route,
    source,
    syncedAt,
    loading: loadingRoute,
    refreshing: refreshingRoute,
    errorMessage: routeError,
    warningMessage: routeWarning,
    refresh: refreshRoute,
  } = useTodayRoute(refreshKey);

  const loadOpenEntry = useCallback(async (): Promise<void> => {
    setLoadingEntry(true);
    setTimeClockError(null);

    try {
      const entry = await getOpenTimeEntry();
      setOpenEntry(entry);
    } catch (error) {
      setTimeClockError(
        error instanceof Error
          ? error.message
          : "Unable to load your current shift.",
      );
    } finally {
      setLoadingEntry(false);
    }
  }, []);

  useEffect(() => {
    void loadOpenEntry();
  }, [loadOpenEntry, refreshKey]);

  const requiresSelfie = openEntry !== null && requiresClockInSelfie(openEntry);

  const canAccessRouteStops =
    openEntry !== null && hasCompletedClockInSelfie(openEntry);

  async function handleClockOut(): Promise<void> {
    if (!openEntry || clockingOut) {
      return;
    }

    setClockingOut(true);
    setTimeClockError(null);

    try {
      await clockOut(openEntry.id);
      await loadOpenEntry();
      await refreshRoute();
    } catch (error) {
      setTimeClockError(
        error instanceof Error ? error.message : "Unable to clock out.",
      );
    } finally {
      setClockingOut(false);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      await signOut();
    } catch (error) {
      setTimeClockError(
        error instanceof Error ? error.message : "Unable to log out.",
      );
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>
              Good morning{profile ? `, ${profile.role}` : ""} ☕
            </Text>

            <Text style={styles.subtitle}>Your field operations for today</Text>
          </View>

          <Pressable
            onPress={() => {
              void handleLogout();
            }}
          >
            <Text style={styles.logout}>Log out</Text>
          </Pressable>
        </View>

        {timeClockError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{timeClockError}</Text>
          </View>
        ) : null}

        {loadingEntry ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#7a3f2c" />

            <Text style={styles.loadingText}>Checking your shift…</Text>
          </View>
        ) : openEntry ? (
          requiresSelfie ? (
            <View style={styles.selfieRequiredCard}>
              <Text style={styles.selfieRequiredLabel}>Selfie required</Text>

              <Text style={styles.selfieRequiredTitle}>
                Finish your clock-in
              </Text>

              <Text style={styles.selfieRequiredText}>
                Your clock-in was recorded, but the required selfie has not been
                completed. Capture it before continuing your shift.
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.resumeSelfieButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => {
                  onResumeSelfie(openEntry.id);
                }}
              >
                <Text style={styles.resumeSelfieButtonText}>Resume Selfie</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.activeShiftCard}>
              <Text style={styles.activeShiftLabel}>Active shift</Text>

              <Text style={styles.activeShiftTime}>
                Clocked in at {formatClockTime(openEntry.clock_in_at)}
              </Text>

              {openEntry.selfie_status === "waived" ? (
                <Text style={styles.waivedText}>
                  Selfie requirement waived by a manager
                </Text>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.clockOutButton,
                  pressed && styles.buttonPressed,
                  clockingOut && styles.buttonDisabled,
                ]}
                disabled={clockingOut}
                onPress={() => {
                  void handleClockOut();
                }}
              >
                {clockingOut ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.clockOutButtonText}>Clock Out</Text>
                )}
              </Pressable>
            </View>
          )
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.clockInCard,
              pressed && styles.cardPressed,
            ]}
            onPress={onClockInPress}
          >
            <Text style={styles.cardTitle}>Clock In</Text>

            <Text style={styles.cardSubtitle}>
              Start your shift from the warehouse or first stop
            </Text>
          </Pressable>
        )}

        {!loadingEntry && !canAccessRouteStops ? (
          <View style={styles.routeAccessNotice}>
            <Text style={styles.routeAccessNoticeTitle}>Route preview</Text>

            <Text style={styles.routeAccessNoticeText}>
              {!openEntry
                ? "You can review today's stops now. Clock in to open stop details and navigation."
                : requiresSelfie
                  ? "Complete your clock-in selfie to open stop details and navigation."
                  : "Complete your clock-in verification to open stop details and navigation."}
            </Text>
          </View>
        ) : null}
        <TodayRouteCard
          route={route}
          source={source}
          syncedAt={syncedAt}
          loading={loadingRoute}
          refreshing={refreshingRoute}
          errorMessage={routeError}
          warningMessage={routeWarning}
          onRefresh={() => {
            void refreshRoute();
          }}
          onStopPress={canAccessRouteStops ? onStopPress : undefined}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5ede1",
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  greeting: {
    color: "#4a2c1a",
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: "#8a6f53",
    fontSize: 12,
    marginTop: 3,
  },
  logout: {
    color: "#b3413e",
    fontSize: 14,
    fontWeight: "600",
  },
  clockInCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e3d4c0",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
    padding: 20,
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardTitle: {
    color: "#2e1d12",
    fontSize: 17,
    fontWeight: "600",
  },
  cardSubtitle: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  loadingCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e3d4c0",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 18,
    padding: 20,
  },
  loadingText: {
    color: "#8a6f53",
    fontSize: 14,
    marginLeft: 12,
  },
  activeShiftCard: {
    backgroundColor: "#e3efe0",
    borderColor: "#bdd4b9",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
    padding: 20,
  },
  activeShiftLabel: {
    color: "#3a6b3e",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  activeShiftTime: {
    color: "#294d2c",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 18,
    marginTop: 6,
  },
  clockOutButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 48,
    paddingVertical: 14,
  },
  clockOutButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
  },
  selfieRequiredCard: {
    backgroundColor: "#f7eadc",
    borderColor: "#e4cdb4",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
    padding: 20,
  },
  selfieRequiredLabel: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  selfieRequiredTitle: {
    color: "#4a2c1a",
    fontSize: 19,
    fontWeight: "700",
    marginTop: 6,
  },
  selfieRequiredText: {
    color: "#725b48",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  resumeSelfieButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  resumeSelfieButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  waivedText: {
    color: "#8a6f53",
    fontSize: 12,
    marginBottom: 14,
    marginTop: -8,
  },
  routeAccessNotice: {
    backgroundColor: "#f7eadc",
    borderColor: "#e4cdb4",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  routeAccessNoticeTitle: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  routeAccessNoticeText: {
    color: "#725b48",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
