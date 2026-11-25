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
import { getUnifiedVisitStep } from "../features/service-visit/state/unified-visit-step";
import {
  getUnifiedVisitProgress,
  UNIFIED_STEP_TITLES,
} from "../features/service-visit/unified-visit-screen.config";
import ArrivalStep from "../features/service-visit/ArrivalStep";
import InventoryAuditStep from "../features/service-visit/InventoryAuditStep";
import RestockDropStep from "../features/service-visit/RestockDropStep";
import MachineScanStep from "../features/service-visit/MachineScanStep";
import BeforePhotosStep from "../features/service-visit/BeforePhotosStep";
import UnifiedDrinkCountStep from "../features/service-visit/UnifiedDrinkCountStep";
import UnifiedMachineRefillStep from "../features/service-visit/UnifiedMachineRefillStep";
import UnifiedAfterServiceStep from "../features/service-visit/UnifiedAfterServiceStep";
import { hasUnsyncedMachinePhotos } from "../features/service-visit/state/multi-machine-photo-sync";

type Props = {
  onBack: () => void;
  onVisitCompleted: () => void;
};

export default function UnifiedServiceVisitScreen({
  onBack,
  onVisitCompleted,
}: Props) {
  const {
    unifiedVisit,
    retryUnifiedSummarySync,
    retryUnifiedPhotoSync,
    clearCompletedUnifiedVisit,
  } = useServiceVisit();

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!unifiedVisit) {
    return null;
  }

  const visit = unifiedVisit;

  const isCompleted = visit.status === "completed";

  const isSummarySynced = visit.summary.syncStatus === "synced";
  const hasPendingPhotos = hasUnsyncedMachinePhotos(visit);

  const isSynced = isSummarySynced && !hasPendingPhotos;

  const currentStep = isCompleted ? null : getUnifiedVisitStep(visit);

  const progress = isCompleted ? null : getUnifiedVisitProgress(visit);

  const machine =
    visit.currentStep === "machine_service"
      ? visit.machines[visit.activeMachineIndex]
      : null;

  const machineLabel = machine
    ? (machine.machineTarget.name ??
      machine.machineTarget.model ??
      machine.machineTarget.serialNumber ??
      `Machine ${visit.activeMachineIndex + 1}`)
    : null;

  async function handleFinish(): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await clearCompletedUnifiedVisit();
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
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (hasPendingPhotos) {
        const result = await retryUnifiedPhotoSync();

        if (!result.allPhotosSynced) {
          if (result.failed > 0) {
            setErrorMessage(
              `${result.failed} photo upload(s) could not be synchronized. Please retry.`,
            );
          } else if (result.skippedUploading > 0) {
            setErrorMessage(
              `${result.skippedUploading} photo(s) were marked as uploading during synchronization. ` +
                "They may still be uploading. If they remain stuck, restart the app " +
                "to recover interrupted uploads, then retry.",
            );
          } else {
            setErrorMessage(
              "Some machine photos are not synchronized yet. " +
                "Please retry photo synchronization before finishing.",
            );
          }

          return;
        }
      }

      if (!isSummarySynced) {
        await retryUnifiedSummarySync();
      }

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to synchronize the completed visit.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.navigationHeader}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Service Visit</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}

        {isCompleted ? (
          <View style={styles.card}>
            <Text style={styles.title}>
              {isSynced ? "Service complete" : "Service saved — sync required"}
            </Text>

            <Text style={styles.description}>
              {isSynced
                ? "All machine services and photos have been synchronized."
                : hasPendingPhotos
                  ? "Some machine photos still need synchronization. Retry photo uploads before finishing."
                  : "The completed visit is saved locally. Synchronize it before finishing."}
            </Text>
            {!isSynced && visit.summary.syncError ? (
              <Text style={styles.errorText}>{visit.summary.syncError}</Text>
            ) : null}

            <Pressable
              disabled={submitting}
              style={[
                styles.primaryButton,
                submitting && styles.disabledButton,
              ]}
              onPress={() => {
                void (isSynced ? handleFinish() : handleRetrySync());
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isSynced ? "Finish and Return Home" : "Retry Sync"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.progress}>
              Step {progress?.current} of {progress?.total}
            </Text>

            <Text style={styles.title}>
              {currentStep ? UNIFIED_STEP_TITLES[currentStep] : "Service Visit"}
            </Text>

            <Text style={styles.description}>{visit.target.clientName}</Text>

            {machine ? (
              <View style={styles.card}>
                <Text style={styles.machineTitle}>
                  Machine {visit.activeMachineIndex + 1} of{" "}
                  {visit.machines.length}
                </Text>

                <Text style={styles.description}>{machineLabel}</Text>
              </View>
            ) : null}

            {currentStep === "arrival" ? (
              <ArrivalStep mode="unified" />
            ) : currentStep === "inventory_audit" ? (
              <InventoryAuditStep />
            ) : currentStep === "restock" ? (
              <RestockDropStep />
            ) : currentStep === "machine_scan" ? (
              <MachineScanStep key={machine?.machineId ?? "machine-scan"} />
            ) : currentStep === "before_photos" ? (
              <BeforePhotosStep key={machine?.machineId ?? "before-photos"} />
            ) : currentStep === "drink_count" ? (
              <UnifiedDrinkCountStep
                key={machine?.machineId ?? "drink-count"}
              />
            ) : currentStep === "machine_refill" ? (
              <UnifiedMachineRefillStep
                key={machine?.machineId ?? "machine-refill"}
              />
            ) : currentStep === "after_service" ? (
              <UnifiedAfterServiceStep
                key={machine?.machineId ?? "after-service"}
              />
            ) : (
              <View style={styles.card}>
                <Text style={styles.description}>
                  Unified step component will be connected next.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5ede1",
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  progress: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 6,
  },
  description: {
    color: "#8a6f53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 18,
    marginTop: 18,
  },
  machineTitle: {
    color: "#4a2c1a",
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    marginBottom: 12,
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
  disabledButton: {
    opacity: 0.6,
  },
});
