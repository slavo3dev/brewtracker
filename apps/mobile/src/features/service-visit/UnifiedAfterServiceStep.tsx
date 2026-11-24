import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { useServiceVisit } from "./ServiceVisitProvider";
import {
  persistAfterPhotoLocally,
  uploadAfterPhoto,
} from "./after-service-media.service";
import { PhotoUploadNotEligibleError } from "./state/multi-machine-photo-claim";
import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";

function friendlyUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("network") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("offline")
  ) {
    return "Saved locally · upload pending. Reconnect and retry.";
  }

  return "Saved locally, but upload failed. Please retry.";
}

export default function UnifiedAfterServiceStep() {
  const cameraRef = useRef<CameraView | null>(null);
  const uploadingRef = useRef<Set<string>>(new Set());
  const [permission, requestPermission] = useCameraPermissions();

  const {
    unifiedVisit,
    unifiedAfterService,
    advanceUnifiedVisit,
    claimUnifiedAfterPhotoUpload,
  } = useServiceVisit();

  const machine =
    unifiedVisit?.currentStep === "machine_service"
      ? unifiedVisit.machines[unifiedVisit.activeMachineIndex]
      : null;

  const machineId = machine?.machineId;
  const afterPhoto = machine?.afterService.afterPhoto ?? null;

  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!unifiedVisit || !machine || machine.currentStep !== "after_service") {
    return null;
  }

  const visit = unifiedVisit;
  const currentMachineId = machine.machineId;
  const canContinue =
    Boolean(afterPhoto?.localUri) && !capturing && !submitting;

  async function uploadSavedPhoto(
    savedVisit: MultiMachineServiceVisit,
    targetMachineId: string,
    localUri: string,
  ): Promise<void> {
    if (uploadingRef.current.has(localUri)) return;

    const savedMachine = savedVisit.machines.find(
      (item) => item.machineId === targetMachineId,
    );
    const photo = savedMachine?.afterService.afterPhoto;

    if (!photo || photo.localUri !== localUri) return;

    let claimedAttemptId: string | null = null;

    uploadingRef.current.add(localUri);

    try {
      const claimedVisit = await claimUnifiedAfterPhotoUpload(
        targetMachineId,
        localUri,
      );

      const claimedPhoto = claimedVisit.machines.find(
        (item) => item.machineId === targetMachineId,
      )?.afterService.afterPhoto;

      if (!claimedPhoto || claimedPhoto.localUri !== localUri) {
        throw new PhotoUploadNotEligibleError();
      }

      if (!claimedPhoto.uploadAttemptId) {
        throw new Error("The claimed after-photo has no upload attempt ID.");
      }

      claimedAttemptId = claimedPhoto.uploadAttemptId;

      const uploaded = await uploadAfterPhoto({
        userId: claimedVisit.userId,
        visitId: claimedVisit.id,
        stopId: claimedVisit.stopId,
        machineId: targetMachineId,
        localUri: claimedPhoto.localUri,
        capturedAt: claimedPhoto.capturedAt,
      });

      await unifiedAfterService.updateAfterPhotoUpload(
        targetMachineId,
        localUri,
        {
          uploadStatus: "uploaded",
          uploadAttemptId: claimedAttemptId,
          storagePath: uploaded.storagePath,
          databaseId: uploaded.databaseId,
          uploadError: null,
          uploadedAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      if (error instanceof PhotoUploadNotEligibleError) {
        return;
      }

      const message = friendlyUploadError(error);

      if (!claimedAttemptId) {
        console.warn(
          "After-photo upload failed before an attempt ID was established.",
          error,
        );
        setErrorMessage(message);
        return;
      }

      try {
        await unifiedAfterService.updateAfterPhotoUpload(
          targetMachineId,
          localUri,
          {
            uploadStatus: "failed",
            uploadAttemptId: claimedAttemptId,
            uploadError: message,
          },
        );
      } catch (updateError) {
        console.warn("Unable to update after-photo status:", updateError);
      }

      setErrorMessage(message);
    } finally {
      uploadingRef.current.delete(localUri);
    }
  }

  async function handleOpenCamera(): Promise<void> {
    setErrorMessage(null);

    if (!permission?.granted) {
      const result = await requestPermission();

      if (!result.granted) {
        setErrorMessage("Camera permission is required.");
        return;
      }
    }

    setCameraOpen(true);
  }

  async function handleCapture(): Promise<void> {
    if (capturing || !cameraRef.current) return;

    setCapturing(true);
    setErrorMessage(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("The camera did not return a photo.");
      }

      const capturedAt = new Date().toISOString();
      const localUri = await persistAfterPhotoLocally(
        `${visit.id}/${currentMachineId}`,
        photo.uri,
      );

      const savedVisit = await unifiedAfterService.saveAfterPhoto(
        currentMachineId,
        { localUri, capturedAt },
      );

      setCameraOpen(false);
      void uploadSavedPhoto(savedVisit, currentMachineId, localUri);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to capture the after-service photo.",
      );
    } finally {
      setCapturing(false);
    }
  }

  async function handleContinue(): Promise<void> {
    if (!canContinue) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await advanceUnifiedVisit();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to continue.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (cameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.actions}>
          <Pressable
            style={styles.secondaryButton}
            disabled={capturing}
            onPress={() => setCameraOpen(false)}
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={styles.primaryButton}
            disabled={capturing}
            onPress={() => void handleCapture()}
          >
            {capturing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryText}>Capture photo</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Completed machine photo</Text>
      <Text style={styles.description}>
        Capture the machine after completing service. The photo is saved locally
        before uploading.
      </Text>

      {afterPhoto ? (
        <>
          <Image source={{ uri: afterPhoto.localUri }} style={styles.preview} />
          <Text style={styles.description}>
            {afterPhoto.uploadStatus === "uploaded"
              ? "Uploaded"
              : afterPhoto.uploadStatus === "uploading"
                ? "Saved locally · uploading"
                : afterPhoto.uploadStatus === "failed"
                  ? "Saved locally · upload pending"
                  : "Saved locally"}
          </Text>

          <View style={styles.actions}>
            {afterPhoto.uploadStatus !== "uploaded" ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  void uploadSavedPhoto(
                    visit,
                    currentMachineId,
                    afterPhoto.localUri,
                  )
                }
              >
                <Text style={styles.secondaryText}>Retry upload</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void handleOpenCamera()}
            >
              <Text style={styles.secondaryText}>Retake</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable
          style={styles.secondaryButton}
          onPress={() => void handleOpenCamera()}
        >
          <Text style={styles.secondaryText}>Open camera</Text>
        </Pressable>
      )}

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <Pressable
        style={[styles.primaryButton, !canContinue && styles.disabledButton]}
        disabled={!canContinue}
        onPress={() => void handleContinue()}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryText}>Continue</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2b1d14",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6f6258",
  },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: "#eee9e3",
  },
  actions: {
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
  primaryText: {
    color: "#ffffff",
    fontSize: 15,
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
  secondaryText: {
    color: "#74401f",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    color: "#a12622",
    fontSize: 13,
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
});
