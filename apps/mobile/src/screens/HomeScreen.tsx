import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  clockOut,
  getOpenTimeEntry,
} from "../features/time-clock/time-clock.service";
import type { TimeEntry } from "../features/time-clock/time-clock.types";
import { supabase } from "../lib/supabase";

type Props = {
  onClockInPress: () => void;
  refreshKey: number;
};

function formatClockTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function HomeScreen({ onClockInPress, refreshKey }: Props) {
  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [clockingOut, setClockingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOpenEntry = useCallback(async (): Promise<void> => {
    setLoadingEntry(true);
    setErrorMessage(null);

    try {
      const entry = await getOpenTimeEntry();
      setOpenEntry(entry);
    } catch (error) {
      setErrorMessage(
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

  async function handleClockOut(): Promise<void> {
    if (!openEntry || clockingOut) {
      return;
    }

    setClockingOut(true);
    setErrorMessage(null);

    try {
      await clockOut(openEntry.id);
      setOpenEntry(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to clock out.",
      );
    } finally {
      setClockingOut(false);
    }
  }

  async function handleLogout(): Promise<void> {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning ☕</Text>
          <Text style={styles.subtitle}>Driver & Tech Field App</Text>
        </View>

        <Pressable
          onPress={() => {
            void handleLogout();
          }}
        >
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {loadingEntry ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#7a3f2c" />
          <Text style={styles.loadingText}>Checking your shift…</Text>
        </View>
      ) : openEntry ? (
        <View style={styles.activeShiftCard}>
          <Text style={styles.activeShiftLabel}>Active shift</Text>

          <Text style={styles.activeShiftTime}>
            Clocked in at {formatClockTime(openEntry.clock_in_at)}
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.clockOutButton,
              pressed && styles.buttonPressed,
              clockingOut && styles.clockOutButtonDisabled,
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
      ) : (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={onClockInPress}
        >
          <Text style={styles.cardTitle}>Clock In</Text>
          <Text style={styles.cardSubtitle}>
            Start your shift from the warehouse or first stop
          </Text>
        </Pressable>
      )}

      <View style={[styles.card, styles.cardDisabled]}>
        <Text style={styles.cardTitle}>Today&apos;s Route</Text>
        <Text style={styles.cardSubtitle}>Coming soon — ROUTE-3</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5ede1",
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    paddingTop: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#4a2c1a",
  },
  subtitle: {
    fontSize: 12,
    color: "#8a6f53",
    marginTop: 3,
  },
  logout: {
    color: "#b3413e",
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e3d4c0",
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#2e1d12",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#8a6f53",
    marginTop: 4,
    lineHeight: 18,
  },
  loadingCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e3d4c0",
    flexDirection: "row",
    alignItems: "center",
  },
  loadingText: {
    color: "#8a6f53",
    fontSize: 14,
    marginLeft: 12,
  },
  activeShiftCard: {
    backgroundColor: "#e3efe0",
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#bdd4b9",
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
    marginTop: 6,
    marginBottom: 18,
  },
  clockOutButton: {
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  clockOutButtonDisabled: {
    opacity: 0.6,
  },
  clockOutButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
  },
});
