import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from "expo-camera";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useServiceVisit } from "./ServiceVisitProvider";

export default function MachineScanStep() {
  const {
    activeVisit,
    completeMachineScan,
  } = useServiceVisit();

  const [permission, requestPermission] =
    useCameraPermissions();

  const [processingScan, setProcessingScan] =
    useState(false);

  const [scanEnabled, setScanEnabled] = useState(true);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const lastScannedValue = useRef<string | null>(null);

  if (!activeVisit) {
    return null;
  }

  const visit = activeVisit;
  const machine = visit.machineTarget;

  async function handleBarcodeScanned(
    result: BarcodeScanningResult,
  ): Promise<void> {
    const scannedValue = result.data.trim();

    if (
      !scanEnabled ||
      processingScan ||
      !scannedValue ||
      lastScannedValue.current === scannedValue
    ) {
      return;
    }

    lastScannedValue.current = scannedValue;
    setScanEnabled(false);
    setProcessingScan(true);
    setErrorMessage(null);

    try {
      await completeMachineScan({
        scannedValue,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to verify the scanned machine.",
      );

      setTimeout(() => {
        lastScannedValue.current = null;
        setScanEnabled(true);
      }, 1200);
    } finally {
      setProcessingScan(false);
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
        <Text style={styles.eyebrow}>Step 2 of 8</Text>

        <Text style={styles.title}>
          Camera permission required
        </Text>

        <Text style={styles.description}>
          Camera access is required to scan and verify the machine
          assigned to this stop.
        </Text>

        {permission.canAskAgain ? (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => {
              void requestPermission();
            }}
          >
            <Text style={styles.primaryButtonText}>
              Allow Camera Access
            </Text>
          </Pressable>
        ) : (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              Camera permission is disabled in device settings.
              Enable it before continuing service.
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Step 2 of 8</Text>

        <Text style={styles.title}>Scan machine QR code</Text>

        <Text style={styles.description}>
          Scan the QR code attached to the machine assigned to this
          stop.
        </Text>

        <View style={styles.machineCard}>
          <Text style={styles.machineLabel}>
            Expected machine
          </Text>

          <Text style={styles.machineName}>
            {machine.name ?? machine.model ?? "Assigned machine"}
          </Text>

          {machine.model && machine.name !== machine.model ? (
            <Text style={styles.machineDetail}>
              Model: {machine.model}
            </Text>
          ) : null}

          {machine.serialNumber ? (
            <Text style={styles.machineDetail}>
              Serial: {machine.serialNumber}
            </Text>
          ) : null}
        </View>

        <View style={styles.cameraFrame}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={
              scanEnabled
                ? (result) => {
                    void handleBarcodeScanned(result);
                  }
                : undefined
            }
          />

          <View pointerEvents="none" style={styles.scanOverlay}>
            <View style={styles.scanTarget} />
          </View>

          {processingScan ? (
            <View style={styles.processingOverlay}>
              <ActivityIndicator color="#ffffff" size="large" />

              <Text style={styles.processingText}>
                Verifying machine…
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.scanHint}>
          Hold the QR code inside the frame.
        </Text>
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => {
              lastScannedValue.current = null;
              setErrorMessage(null);
              setScanEnabled(true);
            }}
          >
            <Text style={styles.retryButtonText}>
              Scan Again
            </Text>
          </Pressable>
        </View>
      ) : null}
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
  machineCard: {
    backgroundColor: "#faf6f0",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    padding: 13,
  },
  machineLabel: {
    color: "#8c8076",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  machineName: {
    color: "#3d2b1f",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 5,
  },
  machineDetail: {
    color: "#8a6f53",
    fontSize: 12,
    marginTop: 4,
  },
  cameraFrame: {
    aspectRatio: 1,
    borderRadius: 16,
    marginTop: 18,
    overflow: "hidden",
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  scanTarget: {
    borderColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 3,
    height: "64%",
    width: "64%",
  },
  processingOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(28, 20, 16, 0.72)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  processingText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
  },
  scanHint: {
    color: "#8c8076",
    fontSize: 12,
    marginTop: 11,
    textAlign: "center",
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    alignItems: "center",
    borderColor: "#d8a9a4",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 11,
  },
  retryButtonText: {
    color: "#9f302d",
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.82,
  },
});