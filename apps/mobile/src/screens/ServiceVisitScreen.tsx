import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useServiceVisit } from "../features/service-visit/ServiceVisitProvider";
import {
  getServiceVisitStep,
  SERVICE_VISIT_STEPS,
  type ServiceVisitStepId,
} from "../features/service-visit/service-visit.types";
import ArrivalStep from "../features/service-visit/ArrivalStep";

type Props = {
  onBack: () => void;
  onVisitCompleted: () => void;
};

type PostArrivalStepId = Exclude<
  ServiceVisitStepId,
  "arrival"
>;

function isPostArrivalStep(
  stepId: ServiceVisitStepId,
): stepId is PostArrivalStepId {
  return stepId !== "arrival";
}

function getStepStatusLabel(
  status: "locked" | "current" | "completed",
): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "current":
      return "Current";
    case "locked":
      return "Locked";
  }
}

export default function ServiceVisitScreen({
  onBack,
  onVisitCompleted,
}: Props) {
  const {
    activeVisit,
    completeCurrentStep,
    clearCompletedVisit,
  } = useServiceVisit();

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  );

  if (!activeVisit) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            No active service visit
          </Text>

          <Text style={styles.emptyText}>
            Return to the route and select a stop.
          </Text>

          <Pressable style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>
              Return to Route
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currentStep = getServiceVisitStep(
    activeVisit.currentStep,
  );

  const currentStepIndex = SERVICE_VISIT_STEPS.findIndex(
    (step) => step.id === activeVisit.currentStep,
  );

  async function handleCompleteCurrentStep(): Promise<void> {
    if (!activeVisit || submitting) {
      return;
    }

    if (!isPostArrivalStep(activeVisit.currentStep)) {
      setErrorMessage(
        "Arrival must be completed through geofence verification.",
      );

      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const updatedVisit = await completeCurrentStep(
        activeVisit.currentStep,
      );

      if (updatedVisit.status === "completed") {
        Alert.alert(
          "Service completed",
          "All eight service steps have been completed.",
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the service step.",
      );
    } finally {
      setSubmitting(false);
    }
  }

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
      >
        <View style={styles.progressCard}>
          <Text style={styles.progressLabel}>
            {activeVisit.status === "completed"
              ? "Service complete"
              : `Step ${currentStepIndex + 1} of ${
                  SERVICE_VISIT_STEPS.length
                }`}
          </Text>

          <Text style={styles.progressTitle}>
            {activeVisit.status === "completed"
              ? "All steps completed"
              : currentStep?.title ?? "Service visit"}
          </Text>

          <Text style={styles.progressDescription}>
            {activeVisit.status === "completed"
              ? "The visit is ready to be closed."
              : currentStep?.description}
          </Text>

          <Text style={styles.visitReference}>
            Visit ID: {activeVisit.id}
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {activeVisit.arrivalVerification ? (
          <View style={styles.arrivalSummaryCard}>
            <Text style={styles.arrivalSummaryTitle}>
              Arrival verified
            </Text>

            <Text style={styles.arrivalSummaryText}>
              {activeVisit.arrivalVerification.method ===
              "manual_override"
                ? "Verified using a manual override."
                : `Verified inside the ${
                    activeVisit.arrivalVerification
                      .geofenceRadiusMeters
                  } m geofence.`}
            </Text>

            {activeVisit.arrivalVerification.distanceMeters != null ? (
              <Text style={styles.arrivalSummaryDetail}>
                Recorded distance:{" "}
                {Math.round(
                  activeVisit.arrivalVerification.distanceMeters,
                )}{" "}
                m
              </Text>
            ) : null}

            {activeVisit.arrivalVerification.overrideReason ? (
              <Text style={styles.arrivalSummaryDetail}>
                Reason:{" "}
                {activeVisit.arrivalVerification.overrideReason}
              </Text>
            ) : null}
          </View>
        ) : null}

        {activeVisit.status === "completed" ? (
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
        ) : activeVisit.currentStep === "arrival" ? (
          <View style={styles.activeStepContainer}>
            <ArrivalStep />
          </View>
        ) : (
          <>
            <View style={styles.developmentNotice}>
              <Text style={styles.developmentNoticeTitle}>
                Upcoming FLOW story
              </Text>

              <Text style={styles.developmentNoticeText}>
                Step {currentStepIndex + 1} is not implemented yet.
                This temporary control remains available for testing the
                FLOW-1 state machine until its dedicated story is added.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                submitting && styles.buttonDisabled,
              ]}
              disabled={submitting}
              onPress={() => {
                void handleCompleteCurrentStep();
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Complete Current Step
                </Text>
              )}
            </Pressable>
          </>
        )}
        <View style={styles.stepsCard}>
          {activeVisit.steps.map((stepState, index) => {
            const definition = SERVICE_VISIT_STEPS[index];

            return (
              <View
                key={stepState.id}
                style={[
                  styles.stepRow,
                  index === activeVisit.steps.length - 1 &&
                    styles.stepRowLast,
                ]}
              >
                <View
                  style={[
                    styles.stepNumber,
                    stepState.status === "completed" &&
                      styles.stepNumberCompleted,
                    stepState.status === "current" &&
                      styles.stepNumberCurrent,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepNumberText,
                      stepState.status !== "locked" &&
                        styles.stepNumberTextActive,
                    ]}
                  >
                    {stepState.status === "completed"
                      ? "✓"
                      : definition.number}
                  </Text>
                </View>

                <View style={styles.stepContent}>
                  <Text
                    style={[
                      styles.stepTitle,
                      stepState.status === "locked" &&
                        styles.stepTitleLocked,
                    ]}
                  >
                    {definition.title}
                  </Text>

                  <Text
                    style={[
                      styles.stepStatus,
                      stepState.status === "completed" &&
                        styles.stepStatusCompleted,
                      stepState.status === "current" &&
                        styles.stepStatusCurrent,
                    ]}
                  >
                    {getStepStatusLabel(stepState.status)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
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
    paddingTop: 20,
  },
  progressCard: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  progressLabel: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  progressTitle: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 7,
  },
  progressDescription: {
    color: "#8a6f53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  visitReference: {
    color: "#a89c8f",
    fontSize: 11,
    marginTop: 14,
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
  },
  stepsCard: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 16,
  },
  stepRow: {
    alignItems: "center",
    borderBottomColor: "#efe6d8",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 15,
  },
  stepRowLast: {
    borderBottomWidth: 0,
  },
  stepNumber: {
    alignItems: "center",
    backgroundColor: "#efe6d8",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginRight: 12,
    width: 36,
  },
  stepNumberCurrent: {
    backgroundColor: "#f3e2cf",
  },
  stepNumberCompleted: {
    backgroundColor: "#e3efe0",
  },
  stepNumberText: {
    color: "#a89c8f",
    fontSize: 14,
    fontWeight: "700",
  },
  stepNumberTextActive: {
    color: "#7a3f2c",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "600",
  },
  stepTitleLocked: {
    color: "#a89c8f",
  },
  stepStatus: {
    color: "#a89c8f",
    fontSize: 12,
    marginTop: 3,
  },
  stepStatusCurrent: {
    color: "#9c5621",
    fontWeight: "600",
  },
  stepStatusCompleted: {
    color: "#3a6b3e",
    fontWeight: "600",
  },
  developmentNotice: {
    backgroundColor: "#f7eadc",
    borderColor: "#e4cdb4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  developmentNoticeTitle: {
    color: "#8a5a3c",
    fontSize: 13,
    fontWeight: "700",
  },
  developmentNoticeText: {
    color: "#8a5a3c",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
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
  arrivalSummaryCard: {
    backgroundColor: "#e8f2e5",
    borderColor: "#c8ddc3",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  arrivalSummaryTitle: {
    color: "#3a6b3e",
    fontSize: 14,
    fontWeight: "700",
  },
  arrivalSummaryText: {
    color: "#4c7050",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  arrivalSummaryDetail: {
    color: "#5e7c61",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  activeStepContainer: {
    marginTop: 18,
  },
});