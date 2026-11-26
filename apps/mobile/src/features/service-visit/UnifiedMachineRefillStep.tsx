
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useServiceVisit } from "./ServiceVisitProvider";
import type { MachineServiceOutcome } from "./service-visit.types";

const OUTCOMES: {
  value: MachineServiceOutcome;
  title: string;
  description: string;
}[] = [
  {
    value: "refilled",
    title: "Refilled",
    description: "The machine was refilled successfully.",
  },
  {
    value: "not_needed",
    title: "Not needed",
    description: "The machine did not require a refill.",
  },
  {
    value: "unable_to_refill",
    title: "Unable to refill",
    description: "The machine could not be refilled. A reason is required.",
  },
];

export default function UnifiedMachineRefillStep() {
  const {
    unifiedVisit,
    unifiedMachineRefill,
    advanceUnifiedVisit,
  } = useServiceVisit();

  const machine =
    unifiedVisit?.machines[unifiedVisit.activeMachineIndex ?? 0];

  const confirmation = machine?.machineRefill ?? null;

  const [outcome, setOutcome] =
    useState<MachineServiceOutcome | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPending =
    confirmation?.syncStatus === "pending_sync" ||
    confirmation?.syncStatus === "failed";

  const isSynced =
    confirmation?.syncStatus === "synced" &&
    Boolean(confirmation.databaseId);

  useEffect(() => {
    if (confirmation) {
      setOutcome(confirmation.outcome);
      setReason(confirmation.reason ?? "");
    } else {
      setOutcome(null);
      setReason("");
    }

    setErrorMessage(null);
  }, [
    machine?.machineId,
    confirmation?.confirmedAt,
    confirmation?.outcome,
    confirmation?.reason,
  ]);

  if (
    !unifiedVisit ||
    unifiedVisit.currentStep !== "machine_service" ||
    !machine ||
    machine.currentStep !== "machine_refill"
  ) {
    return null;
  }

  const normalizedReason = reason.trim();

  const validSelection =
    outcome !== null &&
    (outcome !== "unable_to_refill" ||
      normalizedReason.length > 0);

  const canSubmit =
    !submitting &&
    !confirmation &&
    validSelection;

  async function handleSubmit() {
    if (!machine || !outcome || !canSubmit) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await unifiedMachineRefill.completeMachineRefill(
        machine.machineId,
        {
          outcome,
          reason:
            outcome === "unable_to_refill"
              ? normalizedReason
              : null,
        },
      );

      await advanceUnifiedVisit();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm machine service.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetry() {
    if (!machine || submitting || !isPending) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await unifiedMachineRefill.retryMachineRefillSync(
        machine.machineId,
      );

      await advanceUnifiedVisit();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to synchronize machine service.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinue() {
    if (!isSynced || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await advanceUnifiedVisit();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to continue machine service.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const buttonLabel = isSynced
    ? "Continue to After Service"
    : isPending
      ? "Retry Machine Service Sync"
      : "Confirm Machine Service & Continue";

  const buttonDisabled = submitting ||
    (!isSynced && !isPending && !canSubmit);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Machine service confirmation</Text>

      <Text style={styles.description}>
        Confirm whether this machine was refilled during the visit.
      </Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          This step records the service outcome only.
          No product quantities or inventory movements are created.
        </Text>
      </View>

      {isPending ? (
        <View style={styles.statusCard}>
          <Text style={styles.statusText}>
            Confirmation saved locally. Synchronization is required
            before continuing.
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <View style={styles.options}>
        {OUTCOMES.map((option) => {
          const selected = outcome === option.value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{
                selected,
                disabled: submitting || Boolean(confirmation),
              }}
              disabled={submitting || Boolean(confirmation)}
              onPress={() => {
                setOutcome(option.value);
                setReason("");
                setErrorMessage(null);
              }}
              style={[
                styles.option,
                selected && styles.selectedOption,
              ]}
            >
              <Text style={styles.optionTitle}>
                {selected ? "◉ " : "○ "}
                {option.title}
              </Text>
              <Text style={styles.description}>
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {outcome === "unable_to_refill" ? (
        <View style={styles.reasonSection}>
          <Text style={styles.reasonTitle}>
            Reason for being unable to refill *
          </Text>

          <TextInput
            accessibilityLabel="Reason for being unable to refill"
            editable={!submitting && !confirmation}
            multiline
            onChangeText={setReason}
            placeholder="Describe why the refill could not be completed..."
            style={styles.reasonInput}
            textAlignVertical="top"
            value={reason}
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: buttonDisabled }}
        disabled={buttonDisabled}
        onPress={() => {
          if (isSynced) {
            void handleContinue();
          } else if (isPending) {
            void handleRetry();
          } else {
            void handleSubmit();
          }
        }}
        style={[
          styles.button,
          buttonDisabled && styles.disabledButton,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  title: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
  },
  description: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 19,
  },
  infoCard: {
    backgroundColor: "#f6f2ea",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  infoText: {
    color: "#6b5543",
    fontSize: 12,
    lineHeight: 18,
  },
  statusCard: {
    backgroundColor: "#f6f2ea",
    borderColor: "#d8c7b0",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  statusText: {
    color: "#6b5543",
    fontSize: 13,
  },
  options: {
    gap: 10,
  },
  option: {
    backgroundColor: "#fffdf8",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  selectedOption: {
    backgroundColor: "#f6efe6",
    borderColor: "#b6692b",
  },
  optionTitle: {
    color: "#3d2b1f",
    fontSize: 15,
    fontWeight: "700",
  },
  reasonSection: {
    gap: 8,
  },
  reasonTitle: {
    color: "#6b5543",
    fontSize: 13,
    fontWeight: "600",
  },
  reasonInput: {
    backgroundColor: "#faf6f0",
    borderColor: "#d8c7b0",
    borderRadius: 9,
    borderWidth: 1,
    color: "#2e1d12",
    fontSize: 14,
    minHeight: 90,
    padding: 12,
  },
  errorText: {
    color: "#8a3324",
    fontSize: 13,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#b6692b",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.45,
  },
});
