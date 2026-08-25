import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useServiceVisit } from "../features/service-visit/ServiceVisitProvider";
import { getServiceVisitStep } from "../features/service-visit/service-visit.types";

import ArrivalStep from "../features/service-visit/ArrivalStep";
import MachineScanStep from "../features/service-visit/MachineScanStep";
import BeforePhotosStep from "../features/service-visit/BeforePhotosStep";
import DrinkCountStep from "../features/service-visit/DrinkCountStep";
import InventoryAuditStep from "../features/service-visit/InventoryAuditStep";
import RestockDropStep from "../features/service-visit/RestockDropStep";
import AfterServiceStep from "../features/service-visit/AfterServiceStep";
import SummaryStep from "../features/service-visit/SummaryStep";
import TechBridge from "../features/technical-tickets/TechBridge";

type Props = {
  onBack: () => void;
  onVisitCompleted: () => void;
};

export default function ServiceVisitScreen({
  onBack,
  onVisitCompleted,
}: Props) {
  const { activeVisit, clearCompletedVisit, retrySummarySync } =
    useServiceVisit();

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!activeVisit) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No active service visit</Text>

          <Text style={styles.emptyText}>
            Return to the route and select a stop.
          </Text>

          <Pressable style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>Return to Route</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currentStep = getServiceVisitStep(activeVisit.currentStep);

  /*
   * FLOW-14:
   * Use the actual visit steps rather than the global
   * SERVICE_VISIT_STEPS array because Drink Count is optional.
   */
  const currentStepIndex = activeVisit.steps.findIndex(
    (step) => step.id === activeVisit.currentStep,
  );

  const currentStepNumber = currentStepIndex >= 0 ? currentStepIndex + 1 : 1;

  const totalSteps = activeVisit.steps.length;

  const machineLabel =
    activeVisit.machineTarget.name ??
    activeVisit.machineTarget.model ??
    activeVisit.machineTarget.serialNumber ??
    "Machine";

  async function handleFinish(): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await clearCompletedVisit();
      onVisitCompleted();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to close the completed visit.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetrySync(): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await retrySummarySync();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to sync the completed visit.",
      );
    } finally {
      setSubmitting(false);
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

        <Text style={styles.headerTitle}>Service Visit</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeVisit.status !== "completed" ? (
          <>
            <View style={styles.stepHeader}>
              <Text style={styles.stepProgress}>
                Step {currentStepNumber} of {totalSteps}
              </Text>

              <Text style={styles.stepTitle}>
                {currentStep?.title ?? "Service visit"}
              </Text>

              <Text style={styles.stepContext} numberOfLines={1}>
                {activeVisit.target.clientName}
                {" · "}
                {machineLabel}
              </Text>
            </View>

            <TechBridge />
          </>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {activeVisit.status === "completed" ? (
          activeVisit.summary.syncStatus === "synced" ? (
            <View style={styles.completedCard}>
              <Text style={styles.completedTitle}>Service complete</Text>

              <Text style={styles.completedText}>
                The service was completed and synced.
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  submitting && styles.buttonDisabled,
                ]}
                disabled={submitting}
                onPress={() => {
                  void handleFinish();
                }}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Finish and Return Home
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.syncWarningCard}>
              <Text style={styles.syncWarningTitle}>
                Service saved — sync required
              </Text>

              <Text style={styles.syncWarningText}>
                The service is saved on this device, but the server has not
                confirmed it yet.
              </Text>

              {activeVisit.summary.syncError ? (
                <Text style={styles.syncErrorText}>
                  {activeVisit.summary.syncError}
                </Text>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  submitting && styles.buttonDisabled,
                ]}
                disabled={submitting}
                onPress={() => {
                  void handleRetrySync();
                }}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Retry Sync</Text>
                )}
              </Pressable>
            </View>
          )
        ) : activeVisit.currentStep === "arrival" ? (
          <ArrivalStep />
        ) : activeVisit.currentStep === "machine_scan" ? (
          <MachineScanStep />
        ) : activeVisit.currentStep === "before_photos" ? (
          <BeforePhotosStep />
        ) : activeVisit.currentStep === "drink_count" ? (
          <DrinkCountStep />
        ) : activeVisit.currentStep === "inventory_audit" ? (
          <InventoryAuditStep />
        ) : activeVisit.currentStep === "restock" ? (
          <RestockDropStep />
        ) : activeVisit.currentStep === "after_service" ? (
          <AfterServiceStep />
        ) : activeVisit.currentStep === "summary" ? (
          <SummaryStep />
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
    paddingTop: 16,
  },

  /*
   * Minimal persistent context.
   * Individual step components should contain only
   * information needed to perform that task.
   */
  stepHeader: {
    marginBottom: 16,
  },

  stepProgress: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  stepTitle: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
  },

  stepContext: {
    color: "#8a6f53",
    fontSize: 13,
    marginTop: 4,
  },

  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },

  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
  },

  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52,
    paddingHorizontal: 20,
  },

  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  buttonPressed: {
    opacity: 0.84,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  emptyContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  emptyTitle: {
    color: "#4a2c1a",
    fontSize: 22,
    fontWeight: "700",
  },

  emptyText: {
    color: "#8a6f53",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },

  completedCard: {
    backgroundColor: "#f3faf4",
    borderColor: "#d6e4d8",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },

  completedTitle: {
    color: "#244a2c",
    fontSize: 20,
    fontWeight: "700",
  },

  completedText: {
    color: "#405847",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },

  syncWarningCard: {
    backgroundColor: "#fff4df",
    borderColor: "#e5c890",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },

  syncWarningTitle: {
    color: "#8a5a16",
    fontSize: 16,
    fontWeight: "700",
  },

  syncWarningText: {
    color: "#80663e",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },

  syncErrorText: {
    color: "#9f302d",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
