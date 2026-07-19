import { CameraView, type CameraType, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { uploadClockInSelfie } from "../features/time-clock/selfie.service";

type Props = {
  timeEntryId: string;
  onCompleted: () => void;
};

type ScreenState = "camera" | "preview" | "uploading";

export default function SelfieCaptureScreen({
  timeEntryId,
  onCompleted,
}: Props) {
  const cameraRef = useRef<CameraView | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [screenState, setScreenState] = useState<ScreenState>("camera");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cameraType: CameraType = "front";
  const isUploading = screenState === "uploading";

  async function handleTakePhoto(): Promise<void> {
    if (!cameraRef.current || screenState !== "camera") {
      return;
    }

    setErrorMessage(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("The camera did not return a photo.");
      }

      setPhotoUri(photo.uri);
      setScreenState("preview");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to capture selfie.",
      );
    }
  }

  function handleRetake(): void {
    if (isUploading) {
      return;
    }

    setPhotoUri(null);
    setErrorMessage(null);
    setScreenState("camera");
  }

  async function handleConfirm(): Promise<void> {
    if (!photoUri || isUploading) {
      return;
    }

    setScreenState("uploading");
    setErrorMessage(null);

    try {
      await uploadClockInSelfie({
        timeEntryId,
        photoUri,
      });

      onCompleted();
    } catch (error) {
      setScreenState("preview");

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to upload selfie.",
      );
    }
  }

  function handleRequestPermission(): void {
    void requestPermission();
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator color="#7a3f2c" size="large" />
        <Text style={styles.loadingText}>Checking camera permission…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.permissionTitle}>Camera access required</Text>

        <Text style={styles.permissionMessage}>
          CupCount needs camera access to capture your clock-in selfie.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={handleRequestPermission}
        >
          <Text style={styles.primaryButtonText}>Allow Camera Access</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (photoUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewHeader}>
          <Text style={styles.title}>Review Selfie</Text>

          <Text style={styles.subtitle}>
            Make sure your face is clearly visible.
          </Text>
        </View>

        <View style={styles.previewContainer}>
          <Image
            source={{ uri: photoUri }}
            style={styles.previewImage}
            resizeMode="cover"
          />

          {isUploading ? (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator color="#ffffff" size="large" />

              <Text style={styles.uploadText}>Uploading selfie…</Text>
            </View>
          ) : null}
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.previewActions}>
          <Pressable
            style={[
              styles.secondaryButton,
              isUploading && styles.disabledButton,
            ]}
            disabled={isUploading}
            onPress={handleRetake}
          >
            <Text style={styles.secondaryButtonText}>Retake</Text>
          </Pressable>

          <Pressable
            style={[
              styles.primaryButton,
              styles.confirmButton,
              isUploading && styles.disabledButton,
            ]}
            disabled={isUploading}
            onPress={() => {
              void handleConfirm();
            }}
          >
            {isUploading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Confirm Selfie</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.cameraScreen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={cameraType}
        mirror
      />

      <View style={styles.cameraOverlay}>
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>Clock-In Selfie</Text>

          <Text style={styles.cameraInstructions}>
            Center your face inside the guide and make sure the lighting is
            clear.
          </Text>
        </View>

        <View style={styles.faceGuide} />

        {errorMessage ? (
          <View style={styles.cameraErrorCard}>
            <Text style={styles.cameraErrorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.cameraFooter}>
          <Pressable
            accessibilityLabel="Take clock-in selfie"
            accessibilityRole="button"
            style={styles.captureButtonOuter}
            onPress={() => {
              void handleTakePhoto();
            }}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>

          <Text style={styles.captureHint}>Tap to capture</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5ede1",
    flex: 1,
    paddingHorizontal: 20,
  },
  centeredContainer: {
    alignItems: "center",
    backgroundColor: "#f5ede1",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  loadingText: {
    color: "#8a6f53",
    fontSize: 14,
    marginTop: 14,
  },
  permissionTitle: {
    color: "#4a2c1a",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  permissionMessage: {
    color: "#725b48",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 26,
    marginTop: 10,
    textAlign: "center",
  },
  cameraScreen: {
    backgroundColor: "#000000",
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  cameraHeader: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.46)",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  cameraTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
  },
  cameraInstructions: {
    color: "#f4ece4",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: "center",
  },
  faceGuide: {
    alignSelf: "center",
    borderColor: "rgba(255, 255, 255, 0.88)",
    borderRadius: 140,
    borderWidth: 3,
    height: 340,
    width: 260,
  },
  cameraErrorCard: {
    alignSelf: "center",
    backgroundColor: "rgba(137, 35, 31, 0.88)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cameraErrorText: {
    color: "#ffffff",
    fontSize: 13,
    textAlign: "center",
  },
  cameraFooter: {
    alignItems: "center",
  },
  captureButtonOuter: {
    alignItems: "center",
    borderColor: "#ffffff",
    borderRadius: 39,
    borderWidth: 4,
    height: 78,
    justifyContent: "center",
    width: 78,
  },
  captureButtonInner: {
    backgroundColor: "#ffffff",
    borderRadius: 30,
    height: 60,
    width: 60,
  },
  captureHint: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },
  previewHeader: {
    alignItems: "center",
    paddingBottom: 18,
    paddingTop: 14,
  },
  title: {
    color: "#4a2c1a",
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: "#725b48",
    fontSize: 14,
    marginTop: 5,
    textAlign: "center",
  },
  previewContainer: {
    borderRadius: 20,
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    height: "100%",
    width: "100%",
  },
  uploadOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.52)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  uploadText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12,
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
    lineHeight: 18,
    textAlign: "center",
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 12,
    paddingTop: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  confirmButton: {
    flex: 1,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d8c8b5",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: "#6d4934",
    fontSize: 15,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.55,
  },
});
