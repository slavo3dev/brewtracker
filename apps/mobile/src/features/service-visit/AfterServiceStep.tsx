import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import SignatureCanvas from "react-native-signature-canvas";

import { useServiceVisit } from "./ServiceVisitProvider";
import {
  persistAfterPhotoLocally,
  persistSignatureLocally,
  uploadAfterPhoto,
  uploadSignature,
} from "./after-service-media.service";
import type { ServiceVisit } from "./service-visit.types";

const SIGNATURE_WEB_STYLE = `
  .m-signature-pad {
    box-shadow: none;
    border: none;
  }

  .m-signature-pad--body {
    border: 1px solid #d6c3ab;
    border-radius: 12px;
  }

  .m-signature-pad--footer {
    display: none;
    margin: 0;
  }

  body, html {
    width: 100%;
    height: 100%;
  }
`;

function getFriendlyUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  const normalized = message.toLowerCase();

  const isNetworkError =
    normalized.includes("network request failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("offline");

  return isNetworkError
    ? "Saved locally · upload pending. " + "Reconnect and retry."
    : "Saved locally, but upload failed. " + "Please retry.";
}

export default function AfterServiceStep() {
  const cameraRef = useRef<CameraView | null>(null);

  const [permission, requestPermission] = useCameraPermissions();

  const {
    activeVisit,
    saveAfterPhoto,
    updateAfterPhotoUpload,
    saveSignature,
    updateSignatureUpload,
    removeSignature,
    completeAfterService,
  } = useServiceVisit();

  const [cameraOpen, setCameraOpen] = useState(false);

  const [signatureEditorOpen, setSignatureEditorOpen] = useState(false);

  const [capturing, setCapturing] = useState(false);

  const [savingSignature, setSavingSignature] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (activeVisit?.currentStep !== "after_service") {
      setCameraOpen(false);
      setSignatureEditorOpen(false);
    }
  }, [activeVisit?.currentStep]);

  if (!activeVisit || activeVisit.currentStep !== "after_service") {
    return null;
  }

  const visit = activeVisit;
  const afterPhoto = visit.afterService.afterPhoto;
  const signature = visit.afterService.signature;
  const signatureRequired = visit.afterService.signatureRequired;

  /*
   * Network state deliberately does not appear
   * here. Durable local media is enough to
   * complete Step 7.
   */
  const canContinue =
    Boolean(afterPhoto?.localUri) &&
    (!signatureRequired || Boolean(signature?.localUri)) &&
    !capturing &&
    !savingSignature &&
    !submitting;

  async function uploadSavedAfterPhoto(
    visitWithPhoto: ServiceVisit,
  ): Promise<void> {
    const savedPhoto = visitWithPhoto.afterService.afterPhoto;

    if (!savedPhoto) {
      return;
    }

    try {
      await updateAfterPhotoUpload(savedPhoto.localUri, {
        uploadStatus: "uploading",
        uploadError: null,
      });

      const uploaded = await uploadAfterPhoto({
        userId: visitWithPhoto.userId,
        visitId: visitWithPhoto.id,
        stopId: visitWithPhoto.stopId,
        machineId: visitWithPhoto.machineId,
        localUri: savedPhoto.localUri,
        capturedAt: savedPhoto.capturedAt,
      });

      await updateAfterPhotoUpload(savedPhoto.localUri, {
        uploadStatus: "uploaded",
        storagePath: uploaded.storagePath,
        databaseId: uploaded.databaseId,
        uploadError: null,
        uploadedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn("After-service photo upload failed:", error);

      const message = getFriendlyUploadError(error);

      try {
        await updateAfterPhotoUpload(savedPhoto.localUri, {
          uploadStatus: "failed",
          uploadError: message,
        });

        setErrorMessage(message);
      } catch {
        /*
         * The driver replaced the file while
         * its previous upload was in progress.
         */
      }
    }
  }

  async function handleOpenCamera(): Promise<void> {
    setErrorMessage(null);

    if (!permission?.granted) {
      const result = await requestPermission();

      if (!result.granted) {
        setErrorMessage(
          "Camera permission is required to " +
            "capture the after-service photo.",
        );

        return;
      }
    }

    setCameraOpen(true);
  }

  async function handleCapture(): Promise<void> {
    if (capturing) {
      return;
    }

    setCapturing(true);
    setErrorMessage(null);

    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("The camera did not return a photo.");
      }

      const capturedAt = new Date().toISOString();

      /*
       * The new file is persisted before the
       * provider replaces the previous record.
       */
      const localUri = await persistAfterPhotoLocally(visit.id, photo.uri);

      const visitWithPhoto = await saveAfterPhoto({
        localUri,
        capturedAt,
      });

      setCameraOpen(false);

      /*
       * Do not await the network upload.
       * Local state already contains the media.
       */
      void uploadSavedAfterPhoto(visitWithPhoto);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to capture the " + "after-service photo.",
      );
    } finally {
      setCapturing(false);
    }
  }

  async function uploadSavedSignature(
    visitWithSignature: ServiceVisit,
  ): Promise<void> {
    const savedSignature = visitWithSignature.afterService.signature;

    if (!savedSignature) {
      return;
    }

    try {
      await updateSignatureUpload(savedSignature.localUri, {
        uploadStatus: "uploading",
        uploadError: null,
      });

      const uploaded = await uploadSignature({
        userId: visitWithSignature.userId,
        visitId: visitWithSignature.id,
        stopId: visitWithSignature.stopId,
        clientId: visitWithSignature.clientId,
        machineId: visitWithSignature.machineId,
        localUri: savedSignature.localUri,
        signedAt: savedSignature.signedAt,
      });

      await updateSignatureUpload(savedSignature.localUri, {
        uploadStatus: "uploaded",
        storagePath: uploaded.storagePath,
        databaseId: uploaded.databaseId,
        uploadError: null,
        uploadedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn("Signature upload failed:", error);

      const message = getFriendlyUploadError(error);

      try {
        await updateSignatureUpload(savedSignature.localUri, {
          uploadStatus: "failed",
          uploadError: message,
        });

        setErrorMessage(message);
      } catch {
        /*
         * The driver replaced the signature
         * while its upload was in progress.
         */
      }
    }
  }

  async function handleSignature(dataUrl: string): Promise<void> {
    if (savingSignature) {
      return;
    }

    setSavingSignature(true);
    setErrorMessage(null);

    try {
      const signedAt = new Date().toISOString();

      const localUri = await persistSignatureLocally(visit.id, dataUrl);

      const visitWithSignature = await saveSignature({
        localUri,
        signedAt,
      });

      setSignatureEditorOpen(false);

      void uploadSavedSignature(visitWithSignature);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the signature.",
      );
    } finally {
      setSavingSignature(false);
    }
  }

  async function handleRemoveSignature(): Promise<void> {
    setErrorMessage(null);

    try {
      await removeSignature();
      setSignatureEditorOpen(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to remove signature.",
      );
    }
  }

  async function handleContinue(): Promise<void> {
    if (!canContinue) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeAfterService();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete Step 7.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (cameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />

        <View style={styles.cameraActions}>
          <Pressable
            style={styles.secondaryButton}
            disabled={capturing}
            onPress={() => {
              setCameraOpen(false);
            }}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[styles.primaryButton, capturing && styles.disabledButton]}
            disabled={capturing}
            onPress={() => {
              void handleCapture();
            }}
          >
            {capturing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Capture photo</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Step 7</Text>

      <Text style={styles.title}>After photo and signature</Text>

      <Text style={styles.description}>
        Capture the completed machine and collect the client signature when
        required. You can continue while uploads synchronize.
      </Text>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Completed machine</Text>

          <Text style={styles.requiredBadge}>Required</Text>
        </View>

        {afterPhoto ? (
          <>
            <Image
              source={{
                uri: afterPhoto.localUri,
              }}
              style={styles.preview}
            />

            <Text style={styles.statusText}>
              {afterPhoto.uploadStatus === "uploaded"
                ? "Uploaded"
                : afterPhoto.uploadStatus === "uploading"
                  ? "Saved locally · uploading"
                  : afterPhoto.uploadStatus === "failed"
                    ? "Saved locally · upload pending"
                    : "Saved locally"}
            </Text>

            {afterPhoto.uploadError ? (
              <Text style={styles.warningText}>{afterPhoto.uploadError}</Text>
            ) : null}

            <View style={styles.inlineActions}>
              {afterPhoto.uploadStatus !== "uploaded" ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    void uploadSavedAfterPhoto(visit);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Retry upload</Text>
                </Pressable>
              ) : null}

              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  void handleOpenCamera();
                }}
              >
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              void handleOpenCamera();
            }}
          >
            <Text style={styles.secondaryButtonText}>Open camera</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Client signature</Text>

          <Text
            style={
              signatureRequired ? styles.requiredBadge : styles.optionalBadge
            }
          >
            {signatureRequired ? "Required" : "Optional"}
          </Text>
        </View>

        {signature && !signatureEditorOpen ? (
          <>
            <Image
              source={{
                uri: signature.localUri,
              }}
              style={styles.signaturePreview}
              resizeMode="contain"
            />

            <Text style={styles.statusText}>
              {signature.uploadStatus === "uploaded"
                ? "Uploaded"
                : signature.uploadStatus === "uploading"
                  ? "Saved locally · uploading"
                  : signature.uploadStatus === "failed"
                    ? "Saved locally · upload pending"
                    : "Saved locally"}
            </Text>

            {signature.uploadError ? (
              <Text style={styles.warningText}>{signature.uploadError}</Text>
            ) : null}

            <View style={styles.inlineActions}>
              {signature.uploadStatus !== "uploaded" ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    void uploadSavedSignature(visit);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Retry upload</Text>
                </Pressable>
              ) : null}

              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setSignatureEditorOpen(true);
                }}
              >
                <Text style={styles.secondaryButtonText}>Sign again</Text>
              </Pressable>

              {!signatureRequired ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    void handleRemoveSignature();
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <View style={styles.signatureCanvas}>
              <SignatureCanvas
                onOK={(dataUrl) => {
                  void handleSignature(dataUrl);
                }}
                onEmpty={() => {
                  setErrorMessage("Ask the client to sign " + "before saving.");
                }}
                descriptionText={"Sign inside the box"}
                clearText="Clear"
                confirmText="Save signature"
                webStyle={SIGNATURE_WEB_STYLE}
                autoClear={false}
                imageType="image/png"
              />
            </View>

            {savingSignature ? (
              <View style={styles.savingRow}>
                <ActivityIndicator />

                <Text style={styles.statusText}>Saving signature…</Text>
              </View>
            ) : null}

            {signature ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setSignatureEditorOpen(false);
                }}
              >
                <Text style={styles.secondaryButtonText}>
                  Keep current signature
                </Text>
              </Pressable>
            ) : null}

            {!signatureRequired ? (
              <Text style={styles.optionalText}>
                This client does not require a signature. You may continue
                without one.
              </Text>
            ) : null}
          </>
        )}
      </View>

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <Pressable
        style={[styles.primaryButton, !canContinue && styles.disabledButton]}
        disabled={!canContinue}
        onPress={() => {
          void handleContinue();
        }}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>Continue to closing scan</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 18,
  },
  eyebrow: {
    color: "#9a5b2e",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: "#2b1d14",
    fontSize: 24,
    fontWeight: "700",
  },
  description: {
    color: "#6f6258",
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    gap: 12,
    borderWidth: 1,
    borderColor: "#e7dacb",
    borderRadius: 14,
    padding: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    flex: 1,
    color: "#2b1d14",
    fontSize: 17,
    fontWeight: "700",
  },
  requiredBadge: {
    borderRadius: 999,
    backgroundColor: "#f4e3d6",
    color: "#8a3f1c",
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
  },
  optionalBadge: {
    borderRadius: 999,
    backgroundColor: "#eee9e3",
    color: "#6f6258",
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
  },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: "#eee9e3",
  },
  signaturePreview: {
    width: "100%",
    height: 180,
    borderWidth: 1,
    borderColor: "#e7dacb",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  signatureCanvas: {
    height: 260,
    overflow: "hidden",
    borderRadius: 12,
  },
  statusText: {
    color: "#6f6258",
    fontSize: 14,
  },
  warningText: {
    color: "#8a5a16",
    fontSize: 14,
    lineHeight: 20,
  },
  optionalText: {
    color: "#6f6258",
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: "#a12622",
    fontSize: 14,
    lineHeight: 20,
  },
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#8a4b27",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#b99071",
    borderRadius: 12,
    backgroundColor: "#fffaf5",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#74401f",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.45,
  },
  cameraContainer: {
    minHeight: 580,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#111111",
  },
  camera: {
    flex: 1,
    minHeight: 500,
  },
  cameraActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#ffffff",
    padding: 14,
  },
});
