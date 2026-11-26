import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useServiceVisit } from "./ServiceVisitProvider";

export default function UnifiedDrinkCountStep() {
  const { unifiedVisit, unifiedDrinkCount, advanceUnifiedVisit } =
    useServiceVisit();

  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!unifiedVisit || unifiedVisit.currentStep !== "machine_service") {
    return null;
  }

  const machine = unifiedVisit.machines[unifiedVisit.activeMachineIndex];

  if (!machine || machine.currentStep !== "drink_count") {
    return null;
  }

  const machineId = machine.machineId;
  const savedReading = machine.drinkCount;

  const runningTotal = Number(value);

  const valid =
    value.trim().length > 0 &&
    /^\d+$/.test(value) &&
    Number.isSafeInteger(runningTotal) &&
    runningTotal >= 0;

  const isSynced = savedReading?.syncStatus === "synced";
  const needsRetry =
    savedReading !== null && savedReading.syncStatus !== "synced";

  async function handleSubmit(): Promise<void> {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (isSynced) {
        await advanceUnifiedVisit();
        return;
      }

      if (needsRetry) {
        await unifiedDrinkCount.retryDrinkCountSync(machineId);
      } else {
        if (!valid) {
          throw new Error("Enter a valid Running Total.");
        }

        await unifiedDrinkCount.completeDrinkCount(machineId, runningTotal);
      }

      await advanceUnifiedVisit();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete Drink Count.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Running Total</Text>

      {savedReading ? (
        <View style={styles.savedCard}>
          <Text style={styles.savedLabel}>Saved reading</Text>
          <Text style={styles.savedValue}>{savedReading.runningTotal}</Text>

          {savedReading.archiveTotal !== null ? (
            <Text style={styles.savedLabel}>
              Archive Total: {savedReading.archiveTotal}
            </Text>
          ) : null}

          <Text style={styles.status}>
            {isSynced
              ? "Reading synchronized"
              : "Reading saved locally — synchronization required"}
          </Text>

          {savedReading.syncError ? (
            <Text style={styles.error}>{savedReading.syncError}</Text>
          ) : null}
        </View>
      ) : (
        <TextInput
          accessibilityLabel="Running Total"
          keyboardType="number-pad"
          value={value}
          onChangeText={(text) => {
            setValue(text.replace(/\D/g, ""));
            setErrorMessage(null);
          }}
          placeholder="Enter drink count"
          style={styles.input}
        />
      )}

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable
        disabled={submitting || (!savedReading && !valid)}
        onPress={() => void handleSubmit()}
        style={[
          styles.button,
          (submitting || (!savedReading && !valid)) && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>
            {isSynced
              ? "Continue to Machine Refill"
              : needsRetry
                ? "Retry Sync & Continue"
                : "Save & Continue"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 16,
  },
  label: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: "#e2d4c0",
    borderRadius: 14,
    backgroundColor: "#fffdfa",
    paddingHorizontal: 16,
    color: "#1c1410",
    fontSize: 22,
    fontWeight: "700",
  },
  savedCard: {
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    gap: 8,
  },
  savedLabel: {
    color: "#8a6f53",
    fontSize: 14,
  },
  savedValue: {
    color: "#2e1d12",
    fontSize: 26,
    fontWeight: "700",
  },
  status: {
    color: "#5b7042",
    fontSize: 13,
  },
  error: {
    color: "#8a3324",
    fontSize: 14,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#b6692b",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
