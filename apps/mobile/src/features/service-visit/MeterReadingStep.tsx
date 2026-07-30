import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  loadLatestMachineMeterReading,
  type MachineMeterReadingResult,
} from "./meter-reading.service";
import { useServiceVisit } from "./ServiceVisitProvider";

function formatReading(value: number): string {
  return value.toLocaleString();
}

export default function MeterReadingStep() {
  const {
    activeVisit,
    completeMeterReading,
  } = useServiceVisit();

  const [latestReading, setLatestReading] =
    useState<MachineMeterReadingResult | null>(null);

  const [inputValue, setInputValue] = useState("");

  const [loadingLatest, setLoadingLatest] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const machineId = activeVisit?.machineId ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadLatest(): Promise<void> {
      if (!machineId) {
        return;
      }

      setLoadingLatest(true);
      setErrorMessage(null);

      try {
        const result =
          await loadLatestMachineMeterReading(machineId);

        if (!cancelled) {
          setLatestReading(result);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load the previous meter reading.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingLatest(false);
        }
      }
    }

    void loadLatest();

    return () => {
      cancelled = true;
    };
  }, [machineId]);

  if (!activeVisit) {
    return null;
  }

  const parsedReading =
    inputValue.length > 0
      ? Number(inputValue)
      : null;

  const isValidReading =
    parsedReading !== null &&
    Number.isSafeInteger(parsedReading) &&
    parsedReading >= 0;

  const isLowerThanPrevious =
    isValidReading &&
    latestReading !== null &&
    parsedReading < latestReading.reading;

  const calculatedDelta =
    isValidReading && latestReading
      ? parsedReading - latestReading.reading
      : null;

  const canSubmit =
    !loadingLatest &&
    !submitting &&
    isValidReading &&
    !isLowerThanPrevious;

  function handleInputChange(value: string): void {
    const digitsOnly = value.replace(/\D/g, "");

    setInputValue(digitsOnly);
    setErrorMessage(null);
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || parsedReading === null) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeMeterReading({
        reading: parsedReading,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the meter-reading step.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Step 4</Text>

      <Text style={styles.title}>
        Record meter reading
      </Text>

      <Text style={styles.description}>
        Enter the total cup count displayed by the assigned machine.
      </Text>

      <View style={styles.machineCard}>
        <Text style={styles.machineLabel}>
          Assigned machine
        </Text>

        <Text style={styles.machineName}>
          {activeVisit.machineTarget.name ??
            activeVisit.machineTarget.model ??
            "Coffee machine"}
        </Text>

        {activeVisit.machineTarget.serialNumber ? (
          <Text style={styles.machineDetail}>
            Serial: {activeVisit.machineTarget.serialNumber}
          </Text>
        ) : null}
      </View>

      <View style={styles.previousCard}>
        <Text style={styles.previousLabel}>
          Previous reading
        </Text>

        {loadingLatest ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />

            <Text style={styles.loadingText}>
              Loading meter history…
            </Text>
          </View>
        ) : latestReading ? (
          <>
            <Text style={styles.previousValue}>
              {formatReading(latestReading.reading)}
            </Text>

            <Text style={styles.previousDate}>
              Recorded{" "}
              {new Date(
                latestReading.recordedAt,
              ).toLocaleString()}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.previousValue}>
              No previous reading
            </Text>

            <Text style={styles.previousDate}>
              This will be the first recorded value for this machine.
            </Text>
          </>
        )}
      </View>

      <Text style={styles.inputLabel}>
        Current meter reading
      </Text>

      <TextInput
        accessibilityLabel="Current meter reading"
        editable={!submitting}
        keyboardType="number-pad"
        maxLength={15}
        onChangeText={handleInputChange}
        placeholder="Enter cup count"
        placeholderTextColor="#a89c8f"
        style={[
          styles.input,
          isLowerThanPrevious && styles.inputInvalid,
        ]}
        value={inputValue}
      />

      {isLowerThanPrevious && latestReading ? (
        <View style={styles.validationCard}>
          <Text style={styles.validationText}>
            The reading cannot be lower than the previous value of{" "}
            {formatReading(latestReading.reading)}.
          </Text>
        </View>
      ) : null}

      {calculatedDelta !== null &&
      calculatedDelta >= 0 ? (
        <View style={styles.deltaCard}>
          <Text style={styles.deltaLabel}>
            Cups since previous reading
          </Text>

          <Text style={styles.deltaValue}>
            +{formatReading(calculatedDelta)}
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => {
          void handleSubmit();
        }}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && canSubmit && styles.buttonPressed,
          !canSubmit && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            Save Reading and Continue
          </Text>
        )}
      </Pressable>

      <Text style={styles.helperText}>
        The database performs a final validation before the reading is
        accepted.
      </Text>
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
    marginTop: 6,
  },
  description: {
    color: "#8a6f53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  machineCard: {
    backgroundColor: "#f7eadc",
    borderColor: "#e4cdb4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  machineLabel: {
    color: "#8a5a3c",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  machineName: {
    color: "#4a2c1a",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  machineDetail: {
    color: "#8a6f53",
    fontSize: 12,
    marginTop: 4,
  },
  previousCard: {
    backgroundColor: "#f5f1eb",
    borderColor: "#ded4c7",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  previousLabel: {
    color: "#766657",
    fontSize: 12,
    fontWeight: "700",
  },
  previousValue: {
    color: "#3d2b1f",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 5,
  },
  previousDate: {
    color: "#8a7d70",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 8,
  },
  loadingText: {
    color: "#8a7d70",
    fontSize: 13,
    marginLeft: 8,
  },
  inputLabel: {
    color: "#4a2c1a",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 18,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#d9c9b6",
    borderRadius: 12,
    borderWidth: 1,
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 8,
    minHeight: 58,
    paddingHorizontal: 16,
  },
  inputInvalid: {
    borderColor: "#c76157",
  },
  validationCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  validationText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
  },
  deltaCard: {
    alignItems: "center",
    backgroundColor: "#e8f2e5",
    borderColor: "#c8ddc3",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    padding: 14,
  },
  deltaLabel: {
    color: "#4c7050",
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  deltaValue: {
    color: "#3a6b3e",
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 12,
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
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
    opacity: 0.5,
  },
  helperText: {
    color: "#9b8c7e",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    textAlign: "center",
  },
});