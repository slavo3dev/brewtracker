import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useState } from "react";

import { useServiceVisit } from "./ServiceVisitProvider";
import type { ServiceVisitStepId } from "./service-visit.types";

export default function SummaryStep() {
  const { activeVisit, completeSummary } = useServiceVisit();

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!activeVisit) {
    return null;
  }

  const completedTasks = activeVisit.steps.filter(
    (step) => step.id !== "summary",
  );

  async function handleComplete(): Promise<void> {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeSummary();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete service.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function getTaskLabel(id: ServiceVisitStepId): string {
    switch (id) {
      case "arrival":
        return "Arrival confirmed";

      case "machine_scan":
        return "Machine scanned";

      case "before_photos":
        return "Before photos added";

      case "drink_count":
        return "Drink Count recorded";

      case "inventory_audit":
        return "Inventory audited";

      case "restock":
        return "Refill completed";

      case "after_service":
        return "After-service photo added";

      case "summary":
        return "Review complete";
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.taskList}>
        {completedTasks.map((step) => (
          <View key={step.id} style={styles.taskRow}>
            <Text style={styles.check}>✓</Text>

            <Text style={styles.taskText}>{getTaskLabel(step.id)}</Text>
          </View>
        ))}
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        onPress={() => {
          void handleComplete();
        }}
        style={({ pressed }) => [
          styles.completeButton,
          pressed && styles.buttonPressed,
          submitting && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.completeButtonText}>Complete Service</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },

  taskList: {
    gap: 12,
  },

  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  check: {
    color: "#38734d",
    fontSize: 17,
    fontWeight: "700",
  },

  taskText: {
    color: "#3d2b1f",
    fontSize: 16,
    fontWeight: "500",
  },

  completeButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: "#b6692b",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  completeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  buttonPressed: {
    opacity: 0.85,
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  errorCard: {
    borderWidth: 1,
    borderColor: "#e7b9aa",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff6f3",
  },

  errorText: {
    color: "#8a3324",
    fontSize: 14,
  },
});
