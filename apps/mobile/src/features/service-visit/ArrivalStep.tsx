import {
  distanceMeters,
  type GeoPoint,
} from "@brewtracker/types";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useCurrentLocation } from "../maps/useCurrentLocation";
import { useServiceVisit } from "./ServiceVisitProvider";

function formatDistance(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} km`;
  }

  return `${Math.round(value)} m`;
}

export default function ArrivalStep() {
  const { activeVisit, completeArrival } = useServiceVisit();

  const {
    position,
    status: locationStatus,
    errorMessage: locationError,
    retry,
  } = useCurrentLocation();

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [showOverride, setShowOverride] = useState(false);

  const [overrideReason, setOverrideReason] = useState("");

  const targetPosition = useMemo<GeoPoint | null>(() => {
    if (
      activeVisit?.target.latitude == null ||
      activeVisit.target.longitude == null
    ) {
      return null;
    }

    return {
      latitude: activeVisit.target.latitude,
      longitude: activeVisit.target.longitude,
    };
  }, [
    activeVisit?.target.latitude,
    activeVisit?.target.longitude,
  ]);

  const currentDistance = useMemo(() => {
    if (!position || !targetPosition) {
      return null;
    }

    return distanceMeters(position, targetPosition);
  }, [position, targetPosition]);

  if (!activeVisit) {
    return null;
  }

  const visit = activeVisit;

  const radius = visit.target.geofenceRadiusMeters;

  const isInsideGeofence =
    currentDistance != null && currentDistance <= radius;

  const canConfirmNormally =
    locationStatus === "ready" &&
    position != null &&
    targetPosition != null &&
    isInsideGeofence &&
    !submitting;

  const normalizedOverrideReason = overrideReason.trim();

  const canSubmitOverride =
    showOverride &&
    normalizedOverrideReason.length >= 10 &&
    !submitting;

  function getLocationMessage(): string {
    if (!targetPosition) {
      return "This client has no valid geofence coordinates.";
    }

    switch (locationStatus) {
      case "loading":
        return "Getting your current location…";

      case "permission_denied":
        return "Location permission is denied. Enable it in device settings or use a manual override.";

      case "error":
        return (
          locationError ??
          "Your current location could not be determined."
        );

      case "ready":
        if (currentDistance == null) {
          return "Your distance from the client could not be calculated.";
        }

        if (isInsideGeofence) {
          return `You are ${formatDistance(
            currentDistance,
          )} from ${visit.target.clientName}, inside the ${radius} m service area.`;
        }

        return `You are ${formatDistance(
          currentDistance,
        )} from ${visit.target.clientName}. Move inside the ${radius} m service area.`;
    }
  }

  async function handleConfirmArrival(): Promise<void> {
    if (
      !canConfirmNormally ||
      !position ||
      !targetPosition ||
      currentDistance == null
    ) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeArrival({
        method: "geofence",
        driverPosition: position,
        targetPosition,
        distanceMeters: currentDistance,
        geofenceRadiusMeters: radius,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm your arrival.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManualOverride(): Promise<void> {
    if (!canSubmitOverride) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeArrival({
        method: "manual_override",
        driverPosition: position,
        targetPosition,
        distanceMeters: currentDistance,
        geofenceRadiusMeters: radius,
        overrideReason: normalizedOverrideReason,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit the manual override.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <View style={styles.locationCard}>
        <View style={styles.locationHeader}>
          <View>
            <Text style={styles.eyebrow}>Step 1 of 8</Text>

            <Text style={styles.title}>Verify arrival</Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              isInsideGeofence && styles.statusBadgeSuccess,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isInsideGeofence &&
                  styles.statusBadgeTextSuccess,
              ]}
            >
              {isInsideGeofence ? "In range" : "Not verified"}
            </Text>
          </View>
        </View>

        <Text style={styles.clientName}>
          {visit.target.clientName}
        </Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>
            Allowed radius
          </Text>

          <Text style={styles.detailValue}>{radius} m</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>
            Current distance
          </Text>

          <Text style={styles.detailValue}>
            {currentDistance == null
              ? "Unavailable"
              : formatDistance(currentDistance)}
          </Text>
        </View>

        <View
          style={[
            styles.messageCard,
            isInsideGeofence && styles.messageCardSuccess,
          ]}
        >
          {locationStatus === "loading" ? (
            <ActivityIndicator
              color="#9c5621"
              style={styles.messageSpinner}
            />
          ) : null}

          <Text
            style={[
              styles.messageText,
              isInsideGeofence &&
                styles.messageTextSuccess,
            ]}
          >
            {getLocationMessage()}
          </Text>
        </View>

        {locationStatus === "permission_denied" ||
        locationStatus === "error" ? (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => {
              void retry();
            }}
          >
            <Text style={styles.retryButtonText}>
              Try Location Again
            </Text>
          </Pressable>
        ) : null}
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primaryButton,
          !canConfirmNormally && styles.buttonDisabled,
          pressed &&
            canConfirmNormally &&
            styles.buttonPressed,
        ]}
        disabled={!canConfirmNormally}
        onPress={() => {
          void handleConfirmArrival();
        }}
      >
        {submitting && !showOverride ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            Confirm Arrival
          </Text>
        )}
      </Pressable>

      {!showOverride ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.overrideLink,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            setErrorMessage(null);
            setShowOverride(true);
          }}
        >
          <Text style={styles.overrideLinkText}>
            GPS issue? Request manual override
          </Text>
        </Pressable>
      ) : (
        <View style={styles.overrideCard}>
          <Text style={styles.overrideTitle}>
            Manual arrival override
          </Text>

          <Text style={styles.overrideDescription}>
            Explain why GPS verification cannot be completed. This
            reason will be saved with the service visit for manager
            review.
          </Text>

          <TextInput
            editable={!submitting}
            multiline
            numberOfLines={4}
            maxLength={300}
            placeholder="Example: GPS signal is inaccurate inside the underground parking area."
            placeholderTextColor="#a89c8f"
            style={styles.overrideInput}
            textAlignVertical="top"
            value={overrideReason}
            onChangeText={setOverrideReason}
          />

          <Text style={styles.characterHint}>
            At least 10 characters · {overrideReason.length}/300
          </Text>

          <View style={styles.overrideActions}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.cancelOverrideButton,
                pressed && styles.buttonPressed,
              ]}
              disabled={submitting}
              onPress={() => {
                setShowOverride(false);
                setOverrideReason("");
                setErrorMessage(null);
              }}
            >
              <Text style={styles.cancelOverrideText}>
                Cancel
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.submitOverrideButton,
                !canSubmitOverride && styles.buttonDisabled,
                pressed &&
                  canSubmitOverride &&
                  styles.buttonPressed,
              ]}
              disabled={!canSubmitOverride}
              onPress={() => {
                void handleManualOverride();
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitOverrideText}>
                  Submit Override
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  locationCard: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  locationHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: "#efe6d8",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeSuccess: {
    backgroundColor: "#e3efe0",
  },
  statusBadgeText: {
    color: "#8c8076",
    fontSize: 11,
    fontWeight: "700",
  },
  statusBadgeTextSuccess: {
    color: "#3a6b3e",
  },
  clientName: {
    color: "#54392a",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 15,
    marginTop: 16,
  },
  detailRow: {
    alignItems: "center",
    borderTopColor: "#efe6d8",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  detailLabel: {
    color: "#8c8076",
    fontSize: 13,
  },
  detailValue: {
    color: "#3d2b1f",
    fontSize: 13,
    fontWeight: "600",
  },
  messageCard: {
    alignItems: "flex-start",
    backgroundColor: "#f7eadc",
    borderColor: "#e4cdb4",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    padding: 13,
  },
  messageCardSuccess: {
    backgroundColor: "#e8f2e5",
    borderColor: "#c8ddc3",
  },
  messageSpinner: {
    marginRight: 9,
    marginTop: 1,
  },
  messageText: {
    color: "#8a5a3c",
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  messageTextSuccess: {
    color: "#3a6b3e",
  },
  retryButton: {
    alignItems: "center",
    borderColor: "#cfae8e",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 11,
  },
  retryButtonText: {
    color: "#7a3f2c",
    fontSize: 13,
    fontWeight: "700",
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    padding: 13,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  overrideLink: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 17,
  },
  overrideLinkText: {
    color: "#7a3f2c",
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  overrideCard: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  overrideTitle: {
    color: "#3d2b1f",
    fontSize: 16,
    fontWeight: "700",
  },
  overrideDescription: {
    color: "#8c8076",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  overrideInput: {
    backgroundColor: "#faf6f0",
    borderColor: "#e2d4c0",
    borderRadius: 10,
    borderWidth: 1,
    color: "#3d2b1f",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
    minHeight: 100,
    padding: 12,
  },
  characterHint: {
    color: "#a89c8f",
    fontSize: 11,
    marginTop: 6,
    textAlign: "right",
  },
  overrideActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  cancelOverrideButton: {
    alignItems: "center",
    borderColor: "#d7c7b5",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  cancelOverrideText: {
    color: "#7a3f2c",
    fontSize: 13,
    fontWeight: "700",
  },
  submitOverrideButton: {
    alignItems: "center",
    backgroundColor: "#9c5621",
    borderRadius: 10,
    flex: 1.4,
    justifyContent: "center",
    minHeight: 46,
  },
  submitOverrideText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
});