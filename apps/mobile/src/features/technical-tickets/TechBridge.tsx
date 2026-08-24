import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useServiceVisit } from "../service-visit/ServiceVisitProvider";

import { createTechnicalTicket } from "./technical-ticket.service";

export default function TechBridge() {
  const { activeVisit } = useServiceVisit();

  const [visible, setVisible] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  if (!activeVisit || activeVisit.status !== "in_progress") {
    return null;
  }

  const visit = activeVisit;

  async function handleSubmit(): Promise<void> {
    const trimmedDescription = description.trim();

    if (!trimmedDescription) {
      setMessage("Describe the technical issue.");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await createTechnicalTicket({
        reportedBy: visit.userId,
        sourceVisitId: visit.id,
        stopId: visit.stopId,
        clientId: visit.clientId,
        machineId: visit.machineId,
        description: trimmedDescription,
      });

      setDescription("");
      setVisible(false);
      setMessage(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to report the issue.",
      );
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setMessage(null);
          setVisible(true);
        }}
        style={styles.reportButton}
      >
        <Text style={styles.reportButtonText}>
          Report Technical Issue
        </Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!submitting) {
            setVisible(false);
          }
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>
              Report Technical Issue
            </Text>

            <Text style={styles.context}>
              {activeVisit.target.clientName}
            </Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              editable={!submitting}
              multiline
              maxLength={1000}
              placeholder="Describe the machine issue..."
              textAlignVertical="top"
              style={styles.input}
            />

            {message ? (
              <Text style={styles.error}>
                {message}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                disabled={submitting}
                onPress={() => {
                  setVisible(false);
                  setMessage(null);
                }}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                disabled={
                  submitting || !description.trim()
                }
                onPress={() => {
                  void handleSubmit();
                }}
                style={[
                  styles.submitButton,
                  (submitting ||
                    !description.trim()) &&
                    styles.disabled,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitText}>
                    Submit Issue
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  reportButton: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  reportButtonText: {
    color: "#b6692b",
    fontSize: 14,
    fontWeight: "600",
  },

  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },

  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#fffdf8",
    padding: 24,
    gap: 16,
  },

  title: {
    color: "#3d2b1f",
    fontSize: 22,
    fontWeight: "700",
  },

  context: {
    color: "#75665d",
    fontSize: 14,
  },

  input: {
    minHeight: 130,
    borderWidth: 1,
    borderColor: "#ddd2c5",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 14,
    color: "#3d2b1f",
    fontSize: 16,
  },

  error: {
    color: "#8a3324",
    fontSize: 14,
  },

  actions: {
    flexDirection: "row",
    gap: 12,
  },

  cancelButton: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd2c5",
  },

  cancelText: {
    color: "#3d2b1f",
    fontWeight: "600",
  },

  submitButton: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#b6692b",
  },

  submitText: {
    color: "#ffffff",
    fontWeight: "700",
  },

  disabled: {
    opacity: 0.45,
  },
});