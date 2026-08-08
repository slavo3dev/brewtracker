import { distanceMeters, type GeoPoint } from "@brewtracker/types";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import StopMapCard from "../features/maps/StopMapCard";
import { openExternalNavigation } from "../features/maps/navigation.service";
import { useCurrentLocation } from "../features/maps/useCurrentLocation";
import type { TodayRouteStop } from "../features/routes/route.types";
import { useServiceVisit } from "../features/service-visit/ServiceVisitProvider";

type Props = {
  routeId: string;
  stop: TodayRouteStop;
  onBack: () => void;
  onServiceStarted: () => void;
};

function formatScheduleTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDistance(distance: number): string {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distance)} m`;
}

function getStatusLabel(status: TodayRouteStop["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";

    case "in_progress":
      return "In progress";

    case "completed":
      return "Completed";

    case "skipped":
      return "Skipped";

    default:
      return status;
  }
}

export default function StopDetailsScreen({
  routeId,
  stop,
  onBack,
  onServiceStarted,
}: Props) {
  const {
    position,
    status: locationStatus,
    errorMessage: locationErrorMessage,
    retry: retryLocation,
  } = useCurrentLocation();

  const { activeVisit, startVisit, isVisitForStop } = useServiceVisit();

  const [startingService, setStartingService] = useState(false);

  const [serviceError, setServiceError] = useState<string | null>(null);

  const hasVisitForThisStop = isVisitForStop(stop.id);

  const hasDifferentActiveVisit =
    activeVisit?.status === "in_progress" && activeVisit.stopId !== stop.id;

  const [openingNavigation, setOpeningNavigation] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);

  const destination = useMemo<GeoPoint | null>(() => {
    if (stop.client.latitude == null || stop.client.longitude == null) {
      return null;
    }

    return {
      latitude: stop.client.latitude,
      longitude: stop.client.longitude,
    };
  }, [stop.client.latitude, stop.client.longitude]);

  const distanceFromDestination = useMemo(() => {
    if (!position || !destination) {
      return null;
    }

    return distanceMeters(position, destination);
  }, [position, destination]);

  const scheduledStart = formatScheduleTime(stop.scheduledStartAt);

  const scheduledEnd = formatScheduleTime(stop.scheduledEndAt);

  async function handleNavigate(): Promise<void> {
    if (!destination || openingNavigation) {
      return;
    }

    setOpeningNavigation(true);
    setNavigationError(null);

    try {
      await openExternalNavigation({
        latitude: destination.latitude,
        longitude: destination.longitude,
        label: stop.client.name,
      });
    } catch (error) {
      setNavigationError(
        error instanceof Error ? error.message : "Unable to open navigation.",
      );
    } finally {
      setOpeningNavigation(false);
    }
  }

  async function handleStartService(): Promise<void> {
    if (startingService) {
      return;
    }

    if (hasVisitForThisStop) {
      onServiceStarted();
      return;
    }

    setStartingService(true);
    setServiceError(null);

    if (!stop.machine) {
      throw new Error("No machine is assigned to this service stop.");
    }

    if (!stop.machine.qrCode?.trim()) {
      throw new Error(
        "The assigned machine does not have a QR code. Ask a manager to update the machine record.",
      );
    }

    try {
      await startVisit({
        routeId,
        stopId: stop.id,
        clientId: stop.clientId,
        machineId: stop.machine.id,

        target: {
          clientName: stop.client.name,
          latitude: stop.client.latitude,
          longitude: stop.client.longitude,
          geofenceRadiusMeters: stop.client.geofenceRadiusMeters,
          signatureRequired: stop.client.signatureRequired ?? true,
        },

        machineTarget: {
          id: stop.machine.id,
          name: stop.machine.name,
          model: stop.machine.model,
          serialNumber: stop.machine.serialNumber,
          qrCode: stop.machine.qrCode.trim(),
          status: stop.machine.status,
          installedAt: stop.machine.installedAt,
          lastServiceAt: stop.machine.lastServiceAt,
        },
      });

      onServiceStarted();
    } catch (error) {
      setServiceError(
        error instanceof Error
          ? error.message
          : "Unable to start the service visit.",
      );
    } finally {
      setStartingService(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navigationHeader}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Stop Details</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stopHeader}>
          <View style={styles.sequenceCircle}>
            <Text style={styles.sequenceText}>{stop.sequenceNumber}</Text>
          </View>

          <View style={styles.stopHeaderContent}>
            <Text style={styles.clientName}>{stop.client.name}</Text>

            <Text style={styles.statusText}>{getStatusLabel(stop.status)}</Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <DetailRow
            label="Address"
            value={
              stop.client.address
                ? `${stop.client.address}${
                    stop.client.city ? `, ${stop.client.city}` : ""
                  }`
                : "No address available"
            }
          />

          <DetailRow
            label="Schedule"
            value={
              scheduledStart
                ? scheduledEnd
                  ? `${scheduledStart}–${scheduledEnd}`
                  : scheduledStart
                : "No scheduled time"
            }
          />

          <DetailRow
            label="Machine"
            value={
              stop.machine?.name ?? stop.machine?.model ?? "No machine assigned"
            }
          />

          {stop.machine?.model && stop.machine.name !== stop.machine.model ? (
            <DetailRow label="Model" value={stop.machine.model} />
          ) : null}

          {stop.machine?.serialNumber ? (
            <DetailRow
              label="Serial number"
              value={stop.machine.serialNumber}
            />
          ) : null}

          <DetailRow
            label="Distance"
            value={
              distanceFromDestination != null
                ? formatDistance(distanceFromDestination)
                : locationStatus === "loading"
                  ? "Calculating…"
                  : "Unavailable"
            }
            isLast={!stop.notes}
          />

          {stop.notes ? (
            <DetailRow label="Stop notes" value={stop.notes} isLast />
          ) : null}
        </View>

        {destination ? (
          <StopMapCard
            destination={destination}
            destinationLabel={stop.client.name}
            currentPosition={position}
            loadingCurrentPosition={locationStatus === "loading"}
            locationPermissionDenied={locationStatus === "permission_denied"}
            locationErrorMessage={
              locationStatus === "error" ? locationErrorMessage : null
            }
            onRetryLocation={() => {
              void retryLocation();
            }}
          />
        ) : (
          <View style={styles.missingCoordinatesCard}>
            <Text style={styles.missingCoordinatesTitle}>Map unavailable</Text>

            <Text style={styles.missingCoordinatesText}>
              This client does not have valid latitude and longitude
              coordinates. Ask a manager to update the location.
            </Text>
          </View>
        )}

        {navigationError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{navigationError}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.navigateButton,
            !destination && styles.buttonDisabled,
            openingNavigation && styles.buttonDisabled,
            pressed &&
              destination &&
              !openingNavigation &&
              styles.buttonPressed,
          ]}
          disabled={!destination || openingNavigation}
          onPress={() => {
            void handleNavigate();
          }}
        >
          {openingNavigation ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.navigateButtonText}>Open Navigation</Text>
          )}
        </Pressable>

        <View style={styles.serviceCard}>
          <Text style={styles.serviceTitle}>Service workflow</Text>

          <Text style={styles.serviceText}>
            Complete all eight required service steps in sequence. Your progress
            is saved automatically on this device.
          </Text>

          {hasDifferentActiveVisit ? (
            <View style={styles.activeVisitWarning}>
              <Text style={styles.activeVisitWarningText}>
                Another service visit is currently in progress. Complete or
                cancel it before starting this stop.
              </Text>
            </View>
          ) : null}

          {serviceError ? (
            <View style={styles.serviceErrorCard}>
              <Text style={styles.serviceErrorText}>{serviceError}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.serviceButton,
              hasDifferentActiveVisit && styles.buttonDisabled,
              startingService && styles.buttonDisabled,
              pressed &&
                !hasDifferentActiveVisit &&
                !startingService &&
                styles.buttonPressed,
            ]}
            disabled={hasDifferentActiveVisit || startingService}
            onPress={() => {
              void handleStartService();
            }}
          >
            {startingService ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.serviceButtonText}>
                {hasVisitForThisStop ? "Resume Service" : "Start Service"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.detailRow, isLast && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>

      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5ede1",
    flex: 1,
  },
  navigationHeader: {
    alignItems: "center",
    borderBottomColor: "#e2d4c0",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 20,
  },
  backButton: {
    minWidth: 70,
    paddingVertical: 10,
  },
  backText: {
    color: "#7a3f2c",
    fontSize: 15,
    fontWeight: "600",
  },
  headerTitle: {
    color: "#4a2c1a",
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSpacer: {
    width: 70,
  },
  scrollContent: {
    paddingBottom: 36,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  stopHeader: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 18,
  },
  sequenceCircle: {
    alignItems: "center",
    backgroundColor: "#f3e2cf",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    marginRight: 13,
    width: 44,
  },
  sequenceText: {
    color: "#9c5621",
    fontSize: 17,
    fontWeight: "700",
  },
  stopHeaderContent: {
    flex: 1,
  },
  clientName: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
  },
  statusText: {
    color: "#8a6f53",
    fontSize: 13,
    marginTop: 3,
  },
  detailsCard: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  detailRow: {
    borderBottomColor: "#efe6d8",
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    color: "#a89c8f",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#3d2b1f",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  missingCoordinatesCard: {
    backgroundColor: "#f7eadc",
    borderColor: "#e4cdb4",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
    padding: 18,
  },
  missingCoordinatesTitle: {
    color: "#8a5a3c",
    fontSize: 16,
    fontWeight: "700",
  },
  missingCoordinatesText: {
    color: "#8a5a3c",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
  },
  navigateButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  navigateButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  serviceCard: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 18,
  },
  serviceTitle: {
    color: "#3d2b1f",
    fontSize: 17,
    fontWeight: "700",
  },
  serviceText: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  serviceButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 11,
    justifyContent: "center",
    marginTop: 15,
    minHeight: 48,
  },
  serviceButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  activeVisitWarning: {
    backgroundColor: "#f7eadc",
    borderColor: "#e4cdb4",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  activeVisitWarningText: {
    color: "#8a5a3c",
    fontSize: 12,
    lineHeight: 18,
  },
  serviceErrorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  serviceErrorText: {
    color: "#9f302d",
    fontSize: 12,
    lineHeight: 18,
  },
});
