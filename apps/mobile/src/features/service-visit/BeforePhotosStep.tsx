import {
  CameraView,
  type CameraType,
  useCameraPermissions,
} from "expo-camera";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  deleteLocalBeforePhoto,
  deleteUploadedBeforePhoto,
  persistBeforePhotoLocally,
  uploadBeforePhoto,
} from "./before-photo.service";
import { useServiceVisit } from "./ServiceVisitProvider";
import type {
  BeforePhotoKind,
  BeforePhotoRecord,
} from "./service-visit.types";

type CaptureState =
  | "overview"
  | "camera"
  | "preview"
  | "saving";

function getPhotoTitle(
  kind: BeforePhotoKind,
): string {
  switch (kind) {
    case "exterior":
      return "Machine exterior";

    case "interior_hopper":
      return "Interior / hopper";
  }
}

function getPhotoInstruction(
  kind: BeforePhotoKind,
): string {
  switch (kind) {
    case "exterior":
      return "Capture the complete front and exterior condition of the machine.";

    case "interior_hopper":
      return "Open the required area and clearly capture the interior or hopper condition.";
  }
}

function getUploadLabel(
  photo: BeforePhotoRecord,
): string {
  switch (photo.uploadStatus) {
    case "pending_upload":
      return "Queued for upload";

    case "uploading":
      return "Uploading…";

    case "uploaded":
      return "Uploaded";

    case "failed":
      return "Saved locally · upload pending";
  }
}

export default function BeforePhotosStep() {
  const cameraRef = useRef<CameraView | null>(null);

  const [permission, requestPermission] =
    useCameraPermissions();

  const {
    activeVisit,
    saveBeforePhoto,
    updateBeforePhotoUpload,
    removeBeforePhoto,
    completeBeforePhotos,
  } = useServiceVisit();

  const [captureState, setCaptureState] =
    useState<CaptureState>("overview");

  const [activeKind, setActiveKind] =
    useState<BeforePhotoKind | null>(null);

  const [temporaryPhotoUri, setTemporaryPhotoUri] =
    useState<string | null>(null);

  const [capturing, setCapturing] = useState(false);

  const [uploadingKind, setUploadingKind] =
    useState<BeforePhotoKind | null>(null);

  const [completing, setCompleting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  if (!activeVisit) {
    return null;
  }

  const visit = activeVisit;

  const exteriorPhoto =
    visit.beforePhotos.find(
      (photo) => photo.kind === "exterior",
    ) ?? null;

  const interiorPhoto =
    visit.beforePhotos.find(
      (photo) =>
        photo.kind === "interior_hopper",
    ) ?? null;

  const hasBothPhotos =
    exteriorPhoto !== null &&
    interiorPhoto !== null;

  const uploadInProgress =
    uploadingKind !== null ||
    visit.beforePhotos.some(
      (photo) => photo.uploadStatus === "uploading",
    );

  function openCamera(kind: BeforePhotoKind): void {
    setActiveKind(kind);
    setTemporaryPhotoUri(null);
    setErrorMessage(null);
    setCaptureState("camera");
  }

  function closeCamera(): void {
    if (capturing || captureState === "saving") {
      return;
    }

    setActiveKind(null);
    setTemporaryPhotoUri(null);
    setErrorMessage(null);
    setCaptureState("overview");
  }

  async function handleTakePhoto(): Promise<void> {
    if (
      !cameraRef.current ||
      !activeKind ||
      capturing
    ) {
      return;
    }

    setCapturing(true);
    setErrorMessage(null);

    try {
      const photo =
        await cameraRef.current.takePictureAsync({
          quality: 0.78,
          skipProcessing: false,
        });

      if (!photo?.uri) {
        throw new Error(
          "The camera did not return a photo.",
        );
      }

      setTemporaryPhotoUri(photo.uri);
      setCaptureState("preview");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to capture the service photo.",
      );
    } finally {
      setCapturing(false);
    }
  }

  async function attemptUpload(
    kind: BeforePhotoKind,
    localUri: string,
  ): Promise<void> {
    setUploadingKind(kind);

    try {
      await updateBeforePhotoUpload(kind, {
        uploadStatus: "uploading",
        uploadError: null,
      });

      const localPhoto =
        visit.beforePhotos.find(
          (photo) => photo.kind === kind,
        );

      if (!localPhoto) {
        throw new Error(
          "The local photo metadata could not be found.",
        );
      }

      const result =
        await uploadBeforePhoto({
          userId: visit.userId,

          visitId: visit.id,

          stopId: visit.stopId,

          machineId: visit.machineId,

          capturedAt: localPhoto.capturedAt,

          stage: "before",

          kind,

          localUri,
        });

      await updateBeforePhotoUpload(kind, {
        uploadStatus: "uploaded",

        storagePath: result.storagePath,

        databaseId: result.databaseId,

        uploadError: null,

        uploadedAt: new Date().toISOString(),
    });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to upload the service photo.";

      await updateBeforePhotoUpload(kind, {
        uploadStatus: "failed",
        uploadError: message,
      });
    } finally {
      setUploadingKind(null);
    }
  }

  async function handleUsePhoto(): Promise<void> {
    if (
      !activeKind ||
      !temporaryPhotoUri ||
      captureState === "saving"
    ) {
      return;
    }

    setCaptureState("saving");
    setErrorMessage(null);

    try {
      const previousPhoto =
        visit.beforePhotos.find(
          (photo) => photo.kind === activeKind,
        );

      const capturedAt =
        new Date().toISOString();

      const localUri =
        await persistBeforePhotoLocally({
          visitId: visit.id,
          kind: activeKind,
          temporaryUri: temporaryPhotoUri,
        });

      await saveBeforePhoto({
        kind: activeKind,
        localUri,
        capturedAt,
      });

      if (
        previousPhoto &&
        previousPhoto.localUri !== localUri
      ) {
        await deleteLocalBeforePhoto(
          previousPhoto.localUri,
        );

        await deleteUploadedBeforePhoto(
          previousPhoto.storagePath,
          previousPhoto.databaseId,
        );
      }

      const savedKind = activeKind;

      setActiveKind(null);
      setTemporaryPhotoUri(null);
      setCaptureState("overview");

      void attemptUpload(savedKind, localUri);
    } catch (error) {
      setCaptureState("preview");

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the service photo locally.",
      );
    }
  }

  async function handleRemovePhoto(
    photo: BeforePhotoRecord,
  ): Promise<void> {
    if (
      uploadingKind === photo.kind ||
      completing
    ) {
      return;
    }

    setErrorMessage(null);

    try {
      await removeBeforePhoto(photo.kind);

      await deleteLocalBeforePhoto(photo.localUri);
      await deleteUploadedBeforePhoto(
        photo.storagePath,
        photo.databaseId,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove the service photo.",
      );
    }
  }

  async function handleRetryUpload(
    photo: BeforePhotoRecord,
  ): Promise<void> {
    if (uploadingKind) {
      return;
    }

    setErrorMessage(null);

    await attemptUpload(
      photo.kind,
      photo.localUri,
    );
  }

  async function handleCompleteStep(): Promise<void> {
    if (
      !hasBothPhotos ||
      uploadInProgress ||
      completing
    ) {
      return;
    }

    setCompleting(true);
    setErrorMessage(null);

    try {
      await completeBeforePhotos();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the before-photo step.",
      );
    } finally {
      setCompleting(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#9c5621" />

        <Text style={styles.loadingText}>
          Checking camera permission…
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>
          Step 3 of 8
        </Text>

        <Text style={styles.title}>
          Camera permission required
        </Text>

        <Text style={styles.description}>
          Camera access is required to capture the two mandatory
          before-service photos.
        </Text>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            if (permission.canAskAgain) {
              void requestPermission();
              return;
            }

            void Linking.openSettings();
          }}
        >
          <Text style={styles.primaryButtonText}>
            {permission.canAskAgain
              ? "Allow Camera Access"
              : "Open Settings"}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (
    captureState === "camera" &&
    activeKind
  ) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>
          Step 3 of 8
        </Text>

        <Text style={styles.title}>
          {getPhotoTitle(activeKind)}
        </Text>

        <Text style={styles.description}>
          {getPhotoInstruction(activeKind)}
        </Text>

        <View style={styles.cameraFrame}>
          <CameraView
            ref={cameraRef}
            facing={"back" satisfies CameraType}
            style={styles.camera}
          />
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.cameraActions}>
          <Pressable
            accessibilityRole="button"
            disabled={capturing}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
              capturing && styles.buttonDisabled,
            ]}
            onPress={closeCamera}
          >
            <Text style={styles.secondaryButtonText}>
              Cancel
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={capturing}
            style={({ pressed }) => [
              styles.captureButton,
              pressed && styles.buttonPressed,
              capturing && styles.buttonDisabled,
            ]}
            onPress={() => {
              void handleTakePhoto();
            }}
          >
            {capturing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.captureButtonText}>
                Take Photo
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  if (
    temporaryPhotoUri &&
    activeKind &&
    (captureState === "preview" ||
      captureState === "saving")
  ) {
    const saving =
      captureState === "saving";

    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>
          Review photo
        </Text>

        <Text style={styles.title}>
          {getPhotoTitle(activeKind)}
        </Text>

        <Image
          resizeMode="cover"
          source={{ uri: temporaryPhotoUri }}
          style={styles.previewImage}
        />

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.cameraActions}>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
              saving && styles.buttonDisabled,
            ]}
            onPress={() => {
              setTemporaryPhotoUri(null);
              setErrorMessage(null);
              setCaptureState("camera");
            }}
          >
            <Text style={styles.secondaryButtonText}>
              Retake
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            style={({ pressed }) => [
              styles.captureButton,
              pressed && styles.buttonPressed,
              saving && styles.buttonDisabled,
            ]}
            onPress={() => {
              void handleUsePhoto();
            }}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.captureButtonText}>
                Use Photo
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>
          Step 3 of 8
        </Text>

        <Text style={styles.title}>
          Before-service photos
        </Text>

        <Text style={styles.description}>
          Capture both required views before touching, cleaning, or
          restocking the machine. Photos are saved on this device
          first and uploaded when possible.
        </Text>

        <PhotoSlot
          kind="exterior"
          photo={exteriorPhoto}
          uploading={
            uploadingKind === "exterior"
          }
          onCapture={openCamera}
          onRemove={(photo) => {
            void handleRemovePhoto(photo);
          }}
          onRetry={(photo) => {
            void handleRetryUpload(photo);
          }}
        />

        <PhotoSlot
          kind="interior_hopper"
          photo={interiorPhoto}
          uploading={
            uploadingKind === "interior_hopper"
          }
          onCapture={openCamera}
          onRemove={(photo) => {
            void handleRemovePhoto(photo);
          }}
          onRetry={(photo) => {
            void handleRetryUpload(photo);
          }}
        />
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={
          !hasBothPhotos ||
          uploadInProgress ||
          completing
        }
        style={({ pressed }) => [
          styles.primaryButton,
          (!hasBothPhotos ||
            uploadInProgress ||
            completing) &&
            styles.buttonDisabled,
          pressed &&
            hasBothPhotos &&
            !uploadInProgress &&
            !completing &&
            styles.buttonPressed,
        ]}
        onPress={() => {
          void handleCompleteStep();
        }}
      >
        {completing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            Continue to Meter Reading
          </Text>
        )}
      </Pressable>

      {!hasBothPhotos ? (
        <Text style={styles.requirementHint}>
          Both required photos must be saved before continuing.
        </Text>
      ) : null}
    </View>
  );
}

type PhotoSlotProps = {
  kind: BeforePhotoKind;
  photo: BeforePhotoRecord | null;
  uploading: boolean;
  onCapture: (kind: BeforePhotoKind) => void;
  onRemove: (photo: BeforePhotoRecord) => void;
  onRetry: (photo: BeforePhotoRecord) => void;
};

function PhotoSlot({
  kind,
  photo,
  uploading,
  onCapture,
  onRemove,
  onRetry,
}: PhotoSlotProps) {
  return (
    <View style={styles.photoSlot}>
      <View style={styles.photoSlotHeader}>
        <View style={styles.photoSlotTitleArea}>
          <Text style={styles.photoSlotTitle}>
            {getPhotoTitle(kind)}
          </Text>

          <Text style={styles.photoSlotInstruction}>
            {getPhotoInstruction(kind)}
          </Text>
        </View>

        <View
          style={[
            styles.requiredBadge,
            photo && styles.completeBadge,
          ]}
        >
          <Text
            style={[
              styles.requiredBadgeText,
              photo && styles.completeBadgeText,
            ]}
          >
            {photo ? "Captured" : "Required"}
          </Text>
        </View>
      </View>

      {photo ? (
        <>
          <Image
            resizeMode="cover"
            source={{ uri: photo.localUri }}
            style={styles.thumbnail}
          />

          <View style={styles.uploadStatusRow}>
            {uploading ? (
              <ActivityIndicator
                color="#9c5621"
                size="small"
              />
            ) : null}

            <Text style={styles.uploadStatusText}>
              {getUploadLabel(photo)}
            </Text>
          </View>

          {photo.uploadError ? (
            <Text style={styles.uploadErrorText}>
              {photo.uploadError}
            </Text>
          ) : null}

          <View style={styles.photoActions}>
            <Pressable
              accessibilityRole="button"
              disabled={uploading}
              style={({ pressed }) => [
                styles.smallSecondaryButton,
                pressed && styles.buttonPressed,
                uploading && styles.buttonDisabled,
              ]}
              onPress={() => {
                onCapture(kind);
              }}
            >
              <Text style={styles.smallSecondaryText}>
                Retake
              </Text>
            </Pressable>

            {photo.uploadStatus === "failed" ||
            photo.uploadStatus === "pending_upload" ? (
              <Pressable
                accessibilityRole="button"
                disabled={uploading}
                style={({ pressed }) => [
                  styles.smallPrimaryButton,
                  pressed && styles.buttonPressed,
                  uploading && styles.buttonDisabled,
                ]}
                onPress={() => {
                  onRetry(photo);
                }}
              >
                <Text style={styles.smallPrimaryText}>
                  Retry Upload
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={uploading}
              style={({ pressed }) => [
                styles.removeButton,
                pressed && styles.buttonPressed,
                uploading && styles.buttonDisabled,
              ]}
              onPress={() => {
                onRemove(photo);
              }}
            >
              <Text style={styles.removeButtonText}>
                Remove
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addPhotoButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            onCapture(kind);
          }}
        >
          <Text style={styles.addPhotoButtonText}>
            Capture Photo
          </Text>
        </Pressable>
      )}
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
    fontSize: 22,
    fontWeight: "700",
    marginTop: 5,
  },
  description: {
    color: "#8a6f53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  loadingText: {
    color: "#8a6f53",
    fontSize: 13,
    marginTop: 10,
    textAlign: "center",
  },
  photoSlot: {
    backgroundColor: "#faf6f0",
    borderColor: "#e2d4c0",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  photoSlotHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  photoSlotTitleArea: {
    flex: 1,
    paddingRight: 10,
  },
  photoSlotTitle: {
    color: "#3d2b1f",
    fontSize: 15,
    fontWeight: "700",
  },
  photoSlotInstruction: {
    color: "#8c8076",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  requiredBadge: {
    backgroundColor: "#f3e2cf",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  requiredBadgeText: {
    color: "#9c5621",
    fontSize: 10,
    fontWeight: "700",
  },
  completeBadge: {
    backgroundColor: "#e3efe0",
  },
  completeBadgeText: {
    color: "#3a6b3e",
  },
  addPhotoButton: {
    alignItems: "center",
    borderColor: "#cfae8e",
    borderRadius: 10,
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 48,
  },
  addPhotoButtonText: {
    color: "#7a3f2c",
    fontSize: 13,
    fontWeight: "700",
  },
  thumbnail: {
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginTop: 14,
    width: "100%",
  },
  uploadStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 10,
  },
  uploadStatusText: {
    color: "#6f6258",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  uploadErrorText: {
    color: "#9f302d",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  photoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  smallSecondaryButton: {
    borderColor: "#cfae8e",
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smallSecondaryText: {
    color: "#7a3f2c",
    fontSize: 12,
    fontWeight: "700",
  },
  smallPrimaryButton: {
    backgroundColor: "#9c5621",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smallPrimaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  removeButton: {
    borderColor: "#e6bab4",
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  removeButtonText: {
    color: "#9f302d",
    fontSize: 12,
    fontWeight: "700",
  },
  cameraFrame: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    marginTop: 18,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  previewImage: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    marginTop: 18,
    width: "100%",
  },
  cameraActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#cfae8e",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  secondaryButtonText: {
    color: "#7a3f2c",
    fontSize: 14,
    fontWeight: "700",
  },
  captureButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    flex: 1.4,
    justifyContent: "center",
    minHeight: 50,
  },
  captureButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    padding: 13,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 19,
  },
  requirementHint: {
    color: "#8c8076",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 9,
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.48,
  },
});