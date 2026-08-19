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

export default function DrinkCountStep() {
  const {
    activeVisit,
    completeDrinkCount,
  } = useServiceVisit();

  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  if (!activeVisit) {
    return null;
  }

  const runningTotal = Number(value);

  const valid =
    value.length > 0 &&
    Number.isSafeInteger(runningTotal) &&
    runningTotal >= 0;

  async function handleSubmit() {
    if (!valid || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeDrinkCount({
        runningTotal,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save Drink Count.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Running Total
      </Text>

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

      {errorMessage ? (
        <Text style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}

      <Pressable
        disabled={!valid || submitting}
        onPress={() => void handleSubmit()}
        style={[
          styles.button,
          (!valid || submitting) &&
            styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            Save & Continue
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
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
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});