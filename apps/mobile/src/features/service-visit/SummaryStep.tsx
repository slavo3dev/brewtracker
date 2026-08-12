import {
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";

import { useServiceVisit } from "./ServiceVisitProvider";

export default function SummaryStep() {
  const {
    activeVisit,
    verifyClosingMachineScan,
    completeSummary,
  } = useServiceVisit();

  const [
    cameraPermission,
    requestCameraPermission,
  ] = useCameraPermissions();

  const [
    scanning,
    setScanning,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  if (!activeVisit) {
    return null;
  }

  const closingVerified =
    Boolean(
      activeVisit.summary
        .closingVerification,
    );

  async function handleBarcodeScanned(
    result: BarcodeScanningResult,
  ): Promise<void> {
    if (!scanning) {
      return;
    }

    setScanning(false);
    setErrorMessage(null);

    try {
      await verifyClosingMachineScan(
        result.data,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to verify the machine.",
      );
    }
  }

  async function handleStartScan(): Promise<void> {
    setErrorMessage(null);

    if (!cameraPermission?.granted) {
      const permission =
        await requestCameraPermission();

      if (!permission.granted) {
        setErrorMessage(
          "Camera permission is required to scan the machine.",
        );

        return;
      }
    }

    setScanning(true);
  }

  async function handleComplete(): Promise<void> {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeSummary();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the service visit.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const deliveredItems =
    activeVisit.restockDrop?.items ??
    [];

  const totalDelivered =
    deliveredItems.reduce(
      (total, item) =>
        total + item.actualQuantity,
      0,
    );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Service Summary
      </Text>

      <Text style={styles.description}>
        Review the completed service and
        scan the machine once more before
        closing this location.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Client
        </Text>

        <Text style={styles.value}>
          {activeVisit.target.clientName}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Machine
        </Text>

        <Text style={styles.value}>
          {activeVisit.machineTarget.name ??
            activeVisit.machineTarget.model ??
            "Assigned machine"}
        </Text>

        {activeVisit.machineTarget
          .serialNumber ? (
          <Text style={styles.detail}>
            Serial:{" "}
            {
              activeVisit.machineTarget
                .serialNumber
            }
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Meter reading
        </Text>

        <Text style={styles.value}>
          {activeVisit.meterReading
            ? activeVisit.meterReading.reading.toLocaleString()
            : "Missing"}
        </Text>

        {activeVisit.meterReading
          ?.delta != null ? (
          <Text style={styles.detail}>
            Increase: +
            {activeVisit.meterReading.delta.toLocaleString()}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Inventory
        </Text>

        <Text style={styles.detail}>
          Products counted:{" "}
          {activeVisit.inventoryAudit
            ?.items.length ?? 0}
        </Text>

        <Text style={styles.detail}>
          Total units delivered:{" "}
          {totalDelivered.toLocaleString()}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Service evidence
        </Text>

        <Text style={styles.detail}>
          Before photos:{" "}
          {activeVisit.beforePhotos.length}
        </Text>

        <Text style={styles.detail}>
          After photo:{" "}
          {activeVisit.afterService
            .afterPhoto
            ? "Captured"
            : "Missing"}
        </Text>

        <Text style={styles.detail}>
          Signature:{" "}
          {activeVisit.afterService
            .signature
            ? "Captured"
            : activeVisit.afterService
                  .signatureRequired
              ? "Required"
              : "Not required"}
        </Text>
      </View>

      <View style={styles.verificationCard}>
        <Text style={styles.cardTitle}>
          Closing machine verification
        </Text>

        {closingVerified ? (
          <>
            <Text style={styles.successText}>
              ✓ Machine verified
            </Text>

            <Text style={styles.detail}>
              The closing scan matches the
              machine assigned to this stop.
            </Text>
          </>
        ) : scanning ? (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  "qr",
                  "code128",
                  "code39",
                  "ean13",
                  "ean8",
                ],
              }}
              onBarcodeScanned={(result) => {
                void handleBarcodeScanned(
                  result,
                );
              }}
            />

            <Pressable
              style={styles.secondaryButton}
              onPress={() =>
                setScanning(false)
              }
            >
              <Text
                style={
                  styles.secondaryButtonText
                }
              >
                Cancel Scan
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              void handleStartScan();
            }}
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Scan Machine to Close
            </Text>
          </Pressable>
        )}
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <Pressable
        disabled={
          !closingVerified ||
          submitting
        }
        style={({ pressed }) => [
          styles.completeButton,

          pressed &&
            styles.buttonPressed,

          (!closingVerified ||
            submitting) &&
            styles.buttonDisabled,
        ]}
        onPress={() => {
          void handleComplete();
        }}
      >
        {submitting ? (
          <ActivityIndicator
            color="#ffffff"
          />
        ) : (
          <Text
            style={
              styles.completeButtonText
            }
          >
            Complete Service
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1c1410",
  },

  description: {
    fontSize: 15,
    lineHeight: 22,
    color: "#6f6258",
  },

  card: {
    borderWidth: 1,
    borderColor: "#e2d4c0",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fffdfa",
    gap: 6,
  },

  verificationCard: {
    borderWidth: 1,
    borderColor: "#e2d4c0",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fffdfa",
    gap: 12,
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3d2b1f",
  },

  value: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1c1410",
  },

  detail: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6f6258",
  },

  successText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#38734d",
  },

  cameraContainer: {
    gap: 12,
  },

  camera: {
    height: 260,
    borderRadius: 16,
    overflow: "hidden",
  },

  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b6692b",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  secondaryButtonText: {
    color: "#9c5621",
    fontWeight: "600",
  },

  completeButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#b6692b",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  completeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  buttonPressed: {
    opacity: 0.85,
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  errorCard: {
    borderWidth: 1,
    borderColor: "#e7b9aa",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff6f3",
  },

  errorText: {
    color: "#8a3324",
    fontSize: 14,
  },
});