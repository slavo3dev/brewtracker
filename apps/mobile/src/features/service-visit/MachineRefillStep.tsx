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
import {
  isLegacyMachineRefill,
  type MachineServiceOutcome,
} from "./service-visit.types";

const OUTCOME_OPTIONS: {
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

export default function MachineRefillStep() {
  const { activeVisit, completeMachineRefill } = useServiceVisit();

  const [outcome, setOutcome] = useState<MachineServiceOutcome | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const savedMachineRefill = activeVisit?.machineRefill ?? null;

  const legacyMachineRefill =
    savedMachineRefill && isLegacyMachineRefill(savedMachineRefill)
      ? savedMachineRefill
      : null;

  const savedConfirmation =
    savedMachineRefill && !isLegacyMachineRefill(savedMachineRefill)
      ? savedMachineRefill
      : null;

  const hasPendingConfirmation =
    savedConfirmation?.syncStatus === "pending_sync" ||
    savedConfirmation?.syncStatus === "failed";

  useEffect(() => {
    if (savedConfirmation && hasPendingConfirmation) {
      setOutcome(savedConfirmation.outcome);
      setReason(savedConfirmation.reason ?? "");
    } else {
      setOutcome(null);
      setReason("");
    }

    setErrorMessage(null);
  }, [
    activeVisit?.id,
    savedConfirmation?.confirmedAt,
    savedConfirmation?.outcome,
    savedConfirmation?.reason,
    hasPendingConfirmation,
  ]);

  if (!activeVisit) {
    return null;
  }

  const normalizedReason = reason.trim();

  const hasValidSelection =
    outcome !== null &&
    (outcome !== "unable_to_refill" || normalizedReason.length > 0);

  const canSubmit = !submitting && !legacyMachineRefill && hasValidSelection;

  async function handleSubmit() {
    if (!canSubmit || !outcome) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeMachineRefill({
        outcome,
        reason: outcome === "unable_to_refill" ? normalizedReason : null,
      });
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Machine service confirmation</Text>
        <Text style={styles.secondaryText}>
          Confirm whether the machine was refilled during this visit.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          This step records the service outcome only. No product quantities are
          entered and no inventory movements are created.
        </Text>
      </View>

      {legacyMachineRefill ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            This visit contains a machine refill recorded with the previous
            inventory workflow.
            {"\n\n"}
            The original product quantities have been preserved.
            {"\n\n"}
            This visit requires legacy synchronization or recovery before
            continuing. Do not start a replacement visit.
          </Text>
        </View>
      ) : null}

      {hasPendingConfirmation ? (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>Confirmation saved locally</Text>
          <Text style={styles.pendingText}>
            Your previous confirmation has not been synchronized. Retry using
            the saved outcome.
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.options}>
        {OUTCOME_OPTIONS.map((option) => {
          const selected = outcome === option.value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{
                selected,
                disabled: submitting || hasPendingConfirmation,
              }}
              disabled={submitting || hasPendingConfirmation}
              onPress={() => {
                setOutcome(option.value);
                setReason("");
                setErrorMessage(null);
              }}
              style={({ pressed }) => [
                styles.optionCard,
                selected && styles.optionCardSelected,
                pressed && !submitting && styles.optionCardPressed,
                (submitting || hasPendingConfirmation) &&
                  styles.optionCardDisabled,
              ]}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>

              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.secondaryText}>{option.description}</Text>
              </View>
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
            editable={!submitting && !hasPendingConfirmation}
            multiline
            onChangeText={(text) => {
              setReason(text);
              setErrorMessage(null);
            }}
            placeholder="Describe why the refill could not be completed..."
            placeholderTextColor="#a89c8f"
            style={styles.reasonInput}
            textAlignVertical="top"
            value={reason}
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => {
          void handleSubmit();
        }}
        style={({ pressed }) => [
          styles.button,
          pressed && canSubmit && styles.buttonPressed,
          !canSubmit && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>
            {hasPendingConfirmation
              ? "Retry Machine Service Sync"
              : "Confirm Machine Service & Continue"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  header: {
    gap: 5,
  },
  title: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
  },
  secondaryText: {
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
  options: {
    gap: 10,
  },
  optionCard: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  optionCardSelected: {
    backgroundColor: "#f6efe6",
    borderColor: "#b6692b",
  },
  optionCardPressed: {
    opacity: 0.8,
  },
  optionCardDisabled: {
    opacity: 0.7,
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    color: "#3d2b1f",
    fontSize: 15,
    fontWeight: "700",
  },
  radio: {
    alignItems: "center",
    borderColor: "#b9a996",
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  radioSelected: {
    borderColor: "#7a3f2c",
  },
  radioDot: {
    backgroundColor: "#7a3f2c",
    borderRadius: 6,
    height: 11,
    width: 11,
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
    textAlignVertical: "top",
  },
  pendingCard: {
    backgroundColor: "#f6f2ea",
    borderColor: "#d8c7b0",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 5,
  },
  pendingTitle: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "700",
  },
  pendingText: {
    color: "#6b5543",
    fontSize: 12,
    lineHeight: 18,
  },
  errorCard: {
    backgroundColor: "#fff6f3",
    borderColor: "#e7b9aa",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    color: "#8a3324",
    fontSize: 13,
    lineHeight: 19,
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
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
