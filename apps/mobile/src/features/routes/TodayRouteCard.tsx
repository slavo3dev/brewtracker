import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  RouteDataSource,
  TodayRoute,
  TodayRouteStop,
} from "./route.types";

type Props = {
  route: TodayRoute | null;
  source: RouteDataSource;
  syncedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  errorMessage: string | null;
  warningMessage: string | null;
  onRefresh: () => void;
  onStopPress?: (stop: TodayRouteStop) => void;
};

function formatTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSyncedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function StopRow({
  stop,
  onPress,
}: {
  stop: TodayRouteStop;
  onPress?: () => void;
}) {
  const scheduledTime = formatTime(stop.scheduledStartAt);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.stopRow,
        pressed && onPress ? styles.stopRowPressed : null,
      ]}
      disabled={!onPress}
      onPress={onPress}
    >
      <View style={styles.sequenceCircle}>
        <Text style={styles.sequenceText}>
          {stop.sequenceNumber}
        </Text>
      </View>

      <View style={styles.stopContent}>
        <View style={styles.stopTitleRow}>
          <Text style={styles.stopTitle} numberOfLines={1}>
            {stop.client.name}
          </Text>

          <Text
            style={[
              styles.status,
              stop.status === "completed"
                ? styles.statusCompleted
                : stop.status === "in_progress"
                  ? styles.statusInProgress
                  : stop.status === "skipped"
                    ? styles.statusSkipped
                    : styles.statusPending,
            ]}
          >
            {getStatusLabel(stop.status)}
          </Text>
        </View>

        {stop.client.address ? (
          <Text style={styles.stopAddress} numberOfLines={2}>
            {stop.client.address}
            {stop.client.city ? `, ${stop.client.city}` : ""}
          </Text>
        ) : null}

        <View style={styles.stopMeta}>
          {scheduledTime ? (
            <Text style={styles.stopMetaText}>
              {scheduledTime}
            </Text>
          ) : null}

          {stop.machine ? (
            <Text style={styles.stopMetaText} numberOfLines={1}>
              {stop.machine.name ??
                stop.machine.model ??
                "Assigned machine"}
            </Text>
          ) : (
            <Text style={styles.stopMetaText}>
              No machine assigned
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function TodayRouteCard({
  route,
  source,
  syncedAt,
  loading,
  refreshing,
  errorMessage,
  warningMessage,
  onRefresh,
  onStopPress,
}: Props) {
  const formattedSyncTime = formatSyncedAt(syncedAt);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Today&apos;s Route</Text>

          {route?.warehouse ? (
            <Text style={styles.subtitle}>
              Starts at {route.warehouse.name}
            </Text>
          ) : (
            <Text style={styles.subtitle}>
              Your assigned stops for today
            </Text>
          )}
        </View>

        <Pressable
          style={[
            styles.refreshButton,
            refreshing && styles.refreshButtonDisabled,
          ]}
          disabled={refreshing}
          onPress={onRefresh}
        >
          {refreshing ? (
            <ActivityIndicator color="#7a3f2c" size="small" />
          ) : (
            <Text style={styles.refreshText}>Refresh</Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator color="#7a3f2c" />

          <Text style={styles.stateText}>
            Loading today&apos;s route…
          </Text>
        </View>
      ) : null}

      {!loading && errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>

          <Pressable onPress={onRefresh}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !errorMessage && warningMessage ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>{warningMessage}</Text>
        </View>
      ) : null}

      {!loading && !errorMessage && route === null ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            No route assigned today
          </Text>

          <Text style={styles.emptyText}>
            Contact your manager if you expect to have scheduled
            stops.
          </Text>
        </View>
      ) : null}

      {!loading &&
      !errorMessage &&
      route &&
      route.stops.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No stops added yet</Text>

          <Text style={styles.emptyText}>
            Your route exists, but no service stops have been added.
          </Text>
        </View>
      ) : null}

      {!loading && !errorMessage && route?.stops.length ? (
        <View style={styles.stops}>
          {route.stops.map((stop) => (
            <StopRow
              key={stop.id}
              stop={stop}
              onPress={
                onStopPress
                  ? () => {
                      onStopPress(stop);
                    }
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}

      {!loading && source ? (
        <View style={styles.syncFooter}>
          <Text style={styles.syncText}>
            {source === "cache" ? "Saved route" : "Synced"}
            {formattedSyncTime ? ` at ${formattedSyncTime}` : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdfa",
    borderColor: "#e3d4c0",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottomColor: "#efe6d8",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    color: "#2e1d12",
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    color: "#8a6f53",
    fontSize: 13,
    marginTop: 4,
  },
  refreshButton: {
    alignItems: "center",
    borderColor: "#d8c8b5",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: 10,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshText: {
    color: "#7a3f2c",
    fontSize: 13,
    fontWeight: "600",
  },
  stateContainer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    padding: 24,
  },
  stateText: {
    color: "#8a6f53",
    fontSize: 14,
    marginLeft: 10,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: "#f8e4e1",
    margin: 16,
    padding: 14,
    borderRadius: 12,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  retryText: {
    color: "#7a3f2c",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
  },
  warningCard: {
    backgroundColor: "#f7eadc",
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
  },
  warningText: {
    color: "#8a5a3c",
    fontSize: 13,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyTitle: {
    color: "#4a2c1a",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    textAlign: "center",
  },
  stops: {
    paddingHorizontal: 16,
  },
  stopRow: {
    borderBottomColor: "#efe6d8",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 16,
  },
  stopRowPressed: {
    opacity: 0.7,
  },
  sequenceCircle: {
    alignItems: "center",
    backgroundColor: "#f3e2cf",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    marginRight: 12,
    width: 34,
  },
  sequenceText: {
    color: "#9c5621",
    fontSize: 14,
    fontWeight: "700",
  },
  stopContent: {
    flex: 1,
  },
  stopTitleRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  stopTitle: {
    color: "#2e1d12",
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    paddingRight: 8,
  },
  stopAddress: {
    color: "#725b48",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  stopMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  stopMetaText: {
    color: "#8a6f53",
    fontSize: 12,
  },
  status: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPending: {
    backgroundColor: "#efe6d8",
    color: "#725b48",
  },
  statusInProgress: {
    backgroundColor: "#f3e2cf",
    color: "#9c5621",
  },
  statusCompleted: {
    backgroundColor: "#e3efe0",
    color: "#3a6b3e",
  },
  statusSkipped: {
    backgroundColor: "#f8e4e1",
    color: "#9f302d",
  },
  syncFooter: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  syncText: {
    color: "#a89c8f",
    fontSize: 11,
  },
});