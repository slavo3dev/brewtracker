import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";

import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useServiceVisit } from "../service-visit/ServiceVisitProvider";

import { prepareServicePhoto } from "../service-visit/photos/prepare-service-photo";

import {
  createTechnicalTicket,
  uploadTechnicalTicketPhoto,
} from "./technical-ticket.service";

export default function TechBridge() {
  const { activeVisit } = useServiceVisit();

  const cameraRef = useRef<CameraView | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [visible, setVisible] = useState(false);

  const [cameraVisible, setCameraVisible] = useState(false);

  const [description, setDescription] = useState("");

  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const [capturing, setCapturing] = useState(false);

  const [message, setMessage] = useState<string | null>(null);

  if (!activeVisit || activeVisit.status !== "in_progress") {
    return null;
  }

  const visit = activeVisit;

  async function handleOpenCamera(): Promise<void> {
    setMessage(null);
    Keyboard.dismiss();

    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();

      if (!result.granted) {
        setMessage(
          "Camera permission is required to add a photo.",
        );

        return;
      }
    }

    setVisible(false);
    setCameraVisible(true);
  }

  async function handleCapturePhoto(): Promise<void> {
    if (!cameraRef.current || capturing) {
      return;
    }

    setCapturing(true);
    setMessage(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
      });

      if (!photo?.uri) {
        throw new Error("The camera did not return a photo.");
      }

      const prepared = await prepareServicePhoto(photo.uri);

      setPhotoUri(prepared.uri);
      setCameraVisible(false);
      setVisible(true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to capture the photo.",
      );
    } finally {
      setCapturing(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    const trimmedDescription = description.trim();

    if (!trimmedDescription) {
      setMessage("Describe the technical issue.");

      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const ticket = await createTechnicalTicket({
        reportedBy: visit.userId,
        sourceVisitId: visit.id,
        stopId: visit.stopId,
        clientId: visit.clientId,
        machineId: visit.machineId,
        description: trimmedDescription,
      });

      if (photoUri) {
        await uploadTechnicalTicketPhoto({
          ticketId: ticket.id,
          userId: visit.userId,
          visitId: visit.id,
          localUri: photoUri,
        });
      }

      setDescription("");
      setPhotoUri(null);
      setVisible(false);
      setMessage(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to report the issue.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report technical issue"
        onPress={() => {
          setMessage(null);
          setVisible(true);
        }}
        style={({ pressed }) => [
          styles.reportButton,
          pressed && styles.reportButtonPressed,
        ]}
      >
        <View style={styles.reportIconContainer}>
          <Ionicons name="construct-outline" size={18} color="#8b4d22" />
        </View>

        <View style={styles.reportContent}>
          <Text style={styles.reportTitle}>Technical issue?</Text>

          <Text style={styles.reportSubtitle}>Report a machine problem</Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color="#8f8177" />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!submitting) {
            Keyboard.dismiss();
            setVisible(false);
          }
        }}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalWrapper}>
            <View style={styles.modal}>
              <ScrollView
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                  <View style={styles.modalHeader}>
                    <View style={styles.headerContent}>
                      <Text style={styles.title}>
                        Report Technical Issue
                      </Text>

                      <Text style={styles.context}>
                        {visit.target.clientName}
                      </Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      disabled={submitting}
                      onPress={() => {
                        Keyboard.dismiss();
                        setVisible(false);
                        setMessage(null);
                      }}
                      style={styles.closeButton}
                    >
                      <Ionicons
                        name="close"
                        size={22}
                        color="#3d2b1f"
                      />
                    </Pressable>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>
                      What's wrong?
                    </Text>

                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      editable={!submitting}
                      multiline
                      maxLength={1000}
                      placeholder="Describe the machine issue..."
                      placeholderTextColor="#9a8c82"
                      textAlignVertical="top"
                      returnKeyType="done"
                      blurOnSubmit
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.field}>
                    <View style={styles.photoHeading}>
                      <Text style={styles.fieldLabel}>
                        Photo
                      </Text>

                      <Text style={styles.optionalText}>
                        Optional
                      </Text>
                    </View>

                    {photoUri ? (
                      <View style={styles.photoCard}>
                        <Image
                          source={{
                            uri: photoUri,
                          }}
                          resizeMode="cover"
                          style={styles.photoPreview}
                        />

                        <View style={styles.photoActions}>
                          <Pressable
                            disabled={submitting}
                            onPress={() => {
                              Keyboard.dismiss();
                              void handleOpenCamera();
                            }}
                            style={styles.photoAction}
                          >
                            <Ionicons
                              name="camera-outline"
                              size={17}
                              color="#8b4d22"
                            />

                            <Text style={styles.photoActionText}>
                              Retake
                            </Text>
                          </Pressable>

                          <Pressable
                            disabled={submitting}
                            onPress={() => {
                              setPhotoUri(null);
                            }}
                            style={styles.photoAction}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={17}
                              color="#8a3324"
                            />

                            <Text
                              style={[
                                styles.photoActionText,
                                styles.removeText,
                              ]}
                            >
                              Remove
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        disabled={submitting}
                        onPress={() => {
                          Keyboard.dismiss();
                          void handleOpenCamera();
                        }}
                        style={({ pressed }) => [
                          styles.addPhotoButton,
                          pressed && styles.addPhotoPressed,
                        ]}
                      >
                        <Ionicons
                          name="camera-outline"
                          size={21}
                          color="#8b4d22"
                        />

                        <Text style={styles.addPhotoText}>
                          Add issue photo
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  {message ? (
                    <View style={styles.errorCard}>
                      <Text style={styles.error}>
                        {message}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      disabled={submitting}
                      onPress={() => {
                        Keyboard.dismiss();
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
                        Keyboard.dismiss();
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
                        <>
                          <Ionicons
                            name="paper-plane-outline"
                            size={17}
                            color="#ffffff"
                          />

                          <Text style={styles.submitText}>
                            Submit Issue
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={cameraVisible}
        animationType="slide"
        onRequestClose={() => {
          if (!capturing) {
            setCameraVisible(false);
            setVisible(true);
          }
        }}
      >
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} facing="back" style={styles.camera} />

          <View style={styles.cameraControls}>
            <Pressable
              disabled={capturing}
              onPress={() => {
                setCameraVisible(false);
                setVisible(true);
              }}
              style={styles.cameraCancel}
            >
              <Text style={styles.cameraCancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              disabled={capturing}
              onPress={() => {
                void handleCapturePhoto();
              }}
              style={styles.captureButton}
            >
              {capturing ? (
                <ActivityIndicator />
              ) : (
                <View style={styles.captureButtonInner} />
              )}
            </Pressable>

            <View style={styles.cameraControlSpacer} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  reportButton: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e4d7ca",
    borderRadius: 16,
    backgroundColor: "#fffaf3",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },

  reportButtonPressed: {
    opacity: 0.8,
  },

  reportIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3e4d4",
  },

  reportContent: {
    flex: 1,
    gap: 2,
  },

  reportTitle: {
    color: "#3d2b1f",
    fontSize: 15,
    fontWeight: "700",
  },

  reportSubtitle: {
    color: "#8f8177",
    fontSize: 13,
  },

  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },

  modal: {
    maxHeight: "90%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: "#fffdf8",
    padding: 22,
    paddingBottom: 30,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  title: {
    color: "#3d2b1f",
    fontSize: 22,
    fontWeight: "700",
  },

  context: {
    marginTop: 4,
    color: "#75665d",
    fontSize: 14,
  },

  closeButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "#f4eee7",
  },

  field: {
    gap: 8,
  },

  fieldLabel: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "700",
  },

  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: "#ddd2c5",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 14,
    color: "#3d2b1f",
    fontSize: 16,
  },

  photoHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  optionalText: {
    color: "#8f8177",
    fontSize: 12,
  },

  addPhotoButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d5b89d",
    borderRadius: 14,
    backgroundColor: "#fffaf3",
  },

  addPhotoPressed: {
    opacity: 0.75,
  },

  addPhotoText: {
    color: "#8b4d22",
    fontSize: 14,
    fontWeight: "600",
  },

  photoCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e4d7ca",
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },

  photoPreview: {
    width: "100%",
    height: 180,
  },

  photoActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
  },

  photoAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  photoActionText: {
    color: "#8b4d22",
    fontSize: 13,
    fontWeight: "600",
  },

  removeText: {
    color: "#8a3324",
  },

  errorCard: {
    borderWidth: 1,
    borderColor: "#e7b9aa",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff6f3",
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
    minHeight: 52,
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
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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

  cameraContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },

  camera: {
    flex: 1,
  },

  cameraControls: {
    minHeight: 120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    backgroundColor: "#000000",
  },

  cameraCancel: {
    width: 70,
  },

  cameraCancelText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },

  captureButton: {
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 35,
    borderWidth: 4,
    borderColor: "#ffffff",
  },

  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#ffffff",
  },

  cameraControlSpacer: {
    width: 70,
  },

  modalWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },

  modalContent: {
    gap: 20,
  },

  headerContent: {
    flex: 1,
  },
});
