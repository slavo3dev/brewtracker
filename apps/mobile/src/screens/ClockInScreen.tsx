import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  createClockIn,
  getClockContext,
} from "../features/time-clock/time-clock.service";
import type {
  ClockContext,
  ClockTarget,
} from "../features/time-clock/time-clock.types";
import { useGeofence } from "../hooks/useGeofence";
import { useAuth } from "../features/auth/AuthProvider";
import { startLocationTracking } from "../features/fleet/location-tracking.service";
import {
  formatDistanceMeters,
  formatFeet,
} from "@brewtracker/types";

type Props = {
  onBack: () => void;
  onClockedIn: (timeEntryId: string) => void;
};

export default function ClockInScreen({ onBack, onClockedIn }: Props) {
  
  const { session } = useAuth();
  const user = session?.user ?? null;
  
  const [clockContext, setClockContext] = useState<ClockContext | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const targets = useMemo(() => clockContext?.targets ?? [], [clockContext]);

  const {
    status,
    position,
    errorMessage,
  } = useGeofence(targets);

  const clockInTarget =
    targets.find((target) => target.kind === "warehouse") ??
    targets[0] ??
    null;

  const canClockIn =
    position !== null &&
    clockInTarget !== null &&
    !submitting;

  useEffect(() => {
    let mounted = true;

    async function loadContext(): Promise<void> {
      setLoadingTargets(true);
      setScreenError(null);

      try {
        const context = await getClockContext();

        if (mounted) {
          setClockContext(context);
        }
      } catch (error) {
        if (mounted) {
          setScreenError(
            error instanceof Error
              ? error.message
              : "Unable to load clock-in locations.",
          );
        }
      } finally {
        if (mounted) {
          setLoadingTargets(false);
        }
      }
    }

    void loadContext();

    return () => {
      mounted = false;
    };
  }, []);

  function getTargetDescription(target: ClockTarget): string {
    if (target.kind === "warehouse") {
      return `Warehouse: ${target.label}`;
    }

    return `First scheduled stop: ${target.label}`;
  }

  function getReasonText(): string {
    if (screenError) {
      return screenError;
    }

    if (loadingTargets) {
      return "Loading today’s clock-in information…";
    }

    switch (status) {
      case "checking_permission":
        return "Checking location permission…";

      case "permission_denied":
        return "Location permission is denied. Enable it in Settings to record your clock-in location.";

      case "locating":
        return "Getting your current location…";

      case "no_targets":
        return "No warehouse or scheduled stop is available for today. Contact your manager.";

      case "out_of_range":
<<<<<<< HEAD
        if (distanceMeters != null && nearestTarget != null) {
          return `You are ${formatDistanceMeters(
            distanceMeters,
          )} from ${nearestTarget.label}. Move inside its ${formatFeet(
            nearestTarget.radiusMeters,
          )} clock-in area.`;
        }

        return "You are outside all allowed clock-in areas.";

      case "in_range":
        return matchedTarget
          ? `You are inside the allowed area for ${matchedTarget.label}.`
          : "You are ready to clock in.";
=======
      case "in_range":
        return "Your current location will be recorded with this clock-in.";

      case "error":
        return errorMessage ?? "Unable to determine location.";
>>>>>>> dev

      default:
        return "";
    }
  }

  async function handleClockIn(): Promise<void> {
    if (!position || !clockInTarget || !canClockIn) {
      return;
    }

    setSubmitting(true);
    setScreenError(null);

    try {
      const result = await createClockIn({
        position,
        target: clockInTarget,
      });

      if (user) {
        try {
          await startLocationTracking({
            driverId: user.id,
            routeId: result.timeEntry.route_id,
            timeEntryId: result.timeEntry.id,
          });
        } catch (trackingError) {
          console.warn(
            "Clock-in succeeded, but live tracking could not start:",
            trackingError,
          );
        }
      }

      onClockedIn(result.timeEntry.id);

    } catch (error) {
      setScreenError(
        error instanceof Error ? error.message : "Unable to clock in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={onBack} disabled={submitting}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>Clock In</Text>

        {clockInTarget ? (
          <Text style={styles.targetLabel}>
            {getTargetDescription(clockInTarget)}
          </Text>
        ) : null}

        <View
          style={[
            styles.statusCard,
            canClockIn ? styles.statusCardSuccess : styles.statusCardWarning,
          ]}
        >
          {loadingTargets ? <ActivityIndicator color="#7a3f2c" /> : null}

          <Text
            style={[
              styles.statusText,
              canClockIn ? styles.statusTextSuccess : styles.statusTextWarning,
            ]}
          >
            {getReasonText()}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            !canClockIn && styles.buttonDisabled,
            pressed && canClockIn && styles.buttonPressed,
          ]}
          disabled={!canClockIn}
          onPress={() => {
            void handleClockIn();
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              {canClockIn ? "Clock In" : "Clock In Unavailable"}
            </Text>
          )}
        </Pressable>
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
  back: {
    color: "#7a3f2c",
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 12,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 60,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#4a2c1a",
    marginBottom: 8,
  },
  targetLabel: {
    color: "#725b48",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  statusCard: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 28,
    width: "100%",
    minHeight: 82,
    justifyContent: "center",
  },
  statusCardSuccess: {
    backgroundColor: "#e3efe0",
    borderColor: "#bdd4b9",
    borderWidth: 1,
  },
  statusCardWarning: {
    backgroundColor: "#f4e3da",
    borderColor: "#e5cabc",
    borderWidth: 1,
  },
  statusText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  statusTextSuccess: {
    color: "#3a6b3e",
  },
  statusTextWarning: {
    color: "#8a5a3c",
  },
  button: {
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    paddingVertical: 15,
    width: "100%",
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    backgroundColor: "#c9b8a8",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
