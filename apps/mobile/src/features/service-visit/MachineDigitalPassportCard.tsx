import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  loadMachinePassportHistory,
  type MachinePassportHistory,
} from "./machine-passport.service";
import type { ServiceVisitMachineTarget } from "./service-visit.types";

type Props = {
  machine: ServiceVisitMachineTarget;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMachineStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function MachineDigitalPassportCard({ machine }: Props) {
  const [history, setHistory] = useState<MachinePassportHistory | null>(null);

  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadHistory(): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await loadMachinePassportHistory(machine.id);

      setHistory(result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load machine history.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [machine.id]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.eyebrow}>Digital Passport</Text>

          <Text style={styles.title}>
            {machine.name ?? machine.model ?? "Verified machine"}
          </Text>
        </View>

        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
            {formatMachineStatus(machine.status)}
          </Text>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Model</Text>

          <Text style={styles.detailValue}>
            {machine.model ?? "Not recorded"}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Serial number</Text>

          <Text style={styles.detailValue}>
            {machine.serialNumber ?? "Not recorded"}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Installed</Text>

          <Text style={styles.detailValue}>
            {formatDate(machine.installedAt)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Last service</Text>

          <Text style={styles.detailValue}>
            {formatDate(machine.lastServiceAt)}
          </Text>
        </View>
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>Cup-meter history</Text>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#9c5621" />

            <Text style={styles.loadingText}>Loading meter history…</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => {
                void loadHistory();
              }}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : history?.readings.length ? (
          <View style={styles.readingsList}>
            {history.readings.map((reading) => (
              <View key={reading.id} style={styles.readingRow}>
                <View>
                  <Text style={styles.readingValue}>
                    {reading.reading.toLocaleString()} cups
                  </Text>

                  <Text style={styles.readingDate}>
                    {formatDateTime(reading.recordedAt)}
                  </Text>
                </View>

                {reading.notes ? (
                  <Text numberOfLines={2} style={styles.readingNote}>
                    {reading.notes}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistory}>
            <Text style={styles.emptyHistoryText}>
              No meter readings have been recorded yet.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerContent: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: "#2e1d12",
    fontSize: 21,
    fontWeight: "700",
    marginTop: 5,
  },
  statusBadge: {
    backgroundColor: "#e8f2e5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: "#3a6b3e",
    fontSize: 11,
    fontWeight: "700",
  },
  details: {
    marginTop: 18,
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
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 16,
    textAlign: "right",
  },
  historySection: {
    borderTopColor: "#e2d4c0",
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 17,
  },
  sectionTitle: {
    color: "#3d2b1f",
    fontSize: 15,
    fontWeight: "700",
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 14,
  },
  loadingText: {
    color: "#8c8076",
    fontSize: 13,
    marginLeft: 9,
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 13,
    padding: 12,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    alignItems: "center",
    borderColor: "#d8a9a4",
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 10,
    paddingVertical: 9,
  },
  retryButtonText: {
    color: "#9f302d",
    fontSize: 12,
    fontWeight: "700",
  },
  readingsList: {
    marginTop: 9,
  },
  readingRow: {
    borderBottomColor: "#efe6d8",
    borderBottomWidth: 1,
    paddingVertical: 11,
  },
  readingValue: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "700",
  },
  readingDate: {
    color: "#8c8076",
    fontSize: 11,
    marginTop: 3,
  },
  readingNote: {
    color: "#8a6f53",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  emptyHistory: {
    backgroundColor: "#faf6f0",
    borderRadius: 10,
    marginTop: 13,
    padding: 13,
  },
  emptyHistoryText: {
    color: "#8c8076",
    fontSize: 12,
    lineHeight: 18,
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
