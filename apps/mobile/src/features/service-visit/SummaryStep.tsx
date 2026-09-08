import { useCallback, useRef, useState } from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import SignatureCanvas, {
  type SignatureViewRef,
} from "react-native-signature-canvas";

import {
  persistSignatureLocally,
  uploadSignature,
} from "./service-signature.service";

import { useServiceVisit } from "./ServiceVisitProvider";

import {
  wasMachineRefilled,
  type ServiceVisit,
  type ServiceVisitStepId,
} from "./service-visit.types";

type Props = {
  onSignatureStart?: () => void;
  onSignatureEnd?: () => void;
};

const SIGNATURE_WEB_STYLE = `
  html,
  body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
  }

  .m-signature-pad {
    width: 100%;
    height: 100%;
    box-shadow: none;
    border: none;
    margin: 0;
  }

  .m-signature-pad--body {
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    border: 1px solid #d6c3ab;
    border-radius: 12px;
  }

  .m-signature-pad--footer {
    display: none;
  }

  canvas {
    touch-action: none;
  }
`;

export default function SummaryStep({
  onSignatureStart,
  onSignatureEnd,
}: Props) {
  const signatureRef = useRef<SignatureViewRef | null>(null);

  const { activeVisit, completeSummary, saveSignature, updateSignatureUpload } =
    useServiceVisit();

  const [submitting, setSubmitting] = useState(false);

  const [signatureSaving, setSignatureSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uploadSavedSignature = useCallback(
    async (visitWithSignature: ServiceVisit): Promise<void> => {
      const signature = visitWithSignature.clientConfirmation.signature;

      if (!signature) {
        throw new Error("The saved client signature could not be found.");
      }

      try {
        await updateSignatureUpload(signature.localUri, {
          uploadStatus: "uploading",
          uploadError: null,
        });

        const uploaded = await uploadSignature({
          userId: visitWithSignature.userId,
          visitId: visitWithSignature.id,
          stopId: visitWithSignature.stopId,
          clientId: visitWithSignature.clientId,
          machineId: visitWithSignature.machineId,
          localUri: signature.localUri,
          signedAt: signature.signedAt,
        });

        await updateSignatureUpload(signature.localUri, {
          uploadStatus: "uploaded",
          storagePath: uploaded.storagePath,
          databaseId: uploaded.databaseId,
          uploadError: null,
          uploadedAt: new Date().toISOString(),
        });

        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to upload the client signature.";

        try {
          await updateSignatureUpload(signature.localUri, {
            uploadStatus: "failed",
            uploadError: message,
          });
        } catch {
          /*
           * The signature may have been replaced
           * while its upload was running.
           */
        }

        setErrorMessage(message);

        throw error;
      }
    },
    [updateSignatureUpload],
  );

  if (!activeVisit) {
    return null;
  }

  const visit = activeVisit;

  const completedTasks = visit.steps.filter((step) => step.id !== "summary");

  const machineRefilled = wasMachineRefilled(visit.machineRefill);

  const signature = visit.clientConfirmation.signature;

  const signatureUploaded =
    signature?.uploadStatus === "uploaded" &&
    Boolean(signature.databaseId) &&
    Boolean(signature.storagePath) &&
    Boolean(signature.uploadedAt) &&
    Boolean(activeVisit.clientConfirmation.confirmedAt);

  const signatureUploading = signature?.uploadStatus === "uploading";

  const signatureFailed = signature?.uploadStatus === "failed";

  const canComplete =
    signatureUploaded && !submitting && !signatureSaving && !signatureUploading;

  async function handleSignature(dataUrl: string): Promise<void> {
    if (signatureSaving) {
      return;
    }

    setSignatureSaving(true);
    setErrorMessage(null);

    try {
      const signedAt = new Date().toISOString();

      const localUri = await persistSignatureLocally(visit.id, dataUrl);

      const visitWithSignature = await saveSignature({
        localUri,
        signedAt,
      });

      await uploadSavedSignature(visitWithSignature);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the client signature.",
      );
    } finally {
      setSignatureSaving(false);
    }
  }

  async function handleRetrySignature(): Promise<void> {
    if (!signature || signatureSaving || signatureUploading) {
      return;
    }

    setSignatureSaving(true);
    setErrorMessage(null);

    try {
      await uploadSavedSignature(visit);
    } catch {
      // uploadSavedSignature already sets UI error.
    } finally {
      setSignatureSaving(false);
    }
  }

  async function handleComplete(): Promise<void> {
    if (!canComplete) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeSummary();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete service.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function getTaskLabel(id: ServiceVisitStepId): string {
    switch (id) {
      case "arrival":
        return "Arrival confirmed";

      case "machine_scan":
        return "Machine scanned";

      case "before_photos":
        return "Before photos added";

      case "drink_count":
        return "Drink Count recorded";

      case "inventory_audit":
        return "Client reserve counted";

      case "restock":
        return "Client delivery completed";

      case "machine_refill":
        return "Machine refill completed";

      case "after_service":
        return "After-service photo added";

      case "summary":
        return "Review complete";
    }
  }

  function getMachineRefillQuantity(productId: string): number {
    return (
      visit.machineRefill?.items.find((item) => item.productId === productId)
        ?.actualQuantity ?? 0
    );
  }

  function getProductName(productId: string): string {
    return (
      visit.inventoryAudit?.items.find((item) => item.productId === productId)
        ?.name ??
      visit.restockDrop?.items.find((item) => item.productId === productId)
        ?.name ??
      visit.machineRefill?.items.find((item) => item.productId === productId)
        ?.name ??
      "Product"
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Service completed</Text>

        <View style={styles.taskList}>
          {completedTasks.map((step) => (
            <View key={step.id} style={styles.taskRow}>
              <Text style={styles.check}>✓</Text>

              <Text style={styles.taskText}>{getTaskLabel(step.id)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Machine refilled</Text>

        <Text
          style={[
            styles.summaryValue,
            machineRefilled ? styles.summaryValueYes : styles.summaryValueNo,
          ]}
        >
          {machineRefilled ? "Yes" : "No"}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inventory summary</Text>

        <Text style={styles.sectionDescription}>
          Review the client reserve and machine refill quantities before
          confirmation.
        </Text>

        {visit.reserveAfter?.items.map((item) => {
          const machineQuantity = getMachineRefillQuantity(item.productId);

          return (
            <View key={item.productId} style={styles.inventoryCard}>
              <Text style={styles.productName}>
                {getProductName(item.productId)}
              </Text>

              <View style={styles.inventoryRow}>
                <Text style={styles.inventoryLabel}>Client reserve before</Text>

                <Text style={styles.inventoryValue}>
                  {item.reserveBeforeQuantity} {item.normalizedUnit}
                </Text>
              </View>

              <View style={styles.inventoryRow}>
                <Text style={styles.inventoryLabel}>Delivered to client</Text>

                <Text style={styles.inventoryValue}>
                  {item.deliveredQuantity} {item.normalizedUnit}
                </Text>
              </View>

              <View style={[styles.inventoryRow, styles.reserveAfterRow]}>
                <Text style={styles.reserveAfterLabel}>
                  Client reserve after
                </Text>

                <Text style={styles.reserveAfterValue}>
                  {item.reserveAfterQuantity} {item.normalizedUnit}
                </Text>
              </View>

              <View style={styles.inventoryDivider} />

              <View style={styles.inventoryRow}>
                <Text style={styles.inventoryLabel}>Added to machine</Text>

                <Text style={styles.inventoryValue}>
                  {machineQuantity} {item.normalizedUnit}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Client confirmation</Text>

        <Text style={styles.confirmationText}>
          By signing below, the client or responsible person confirms that the
          service was completed, the machine was serviced and cleaned, product
          delivery is correct where applicable, and the inventory count was
          recorded.
        </Text>

        {!signature ? (
          <>
            <View style={styles.signatureContainer}>
              <SignatureCanvas
                ref={signatureRef}
                onBegin={() => {
                  onSignatureStart?.();
                  setErrorMessage(null);
                }}
                onEnd={() => {
                  onSignatureEnd?.();
                }}
                onOK={(dataUrl) => {
                  onSignatureEnd?.();
                  void handleSignature(dataUrl);
                }}
                onEmpty={() => {
                  onSignatureEnd?.();
                  setErrorMessage("Ask the client to sign before saving.");
                }}
                descriptionText=""
                webStyle={SIGNATURE_WEB_STYLE}
                autoClear={false}
                imageType="image/png"
              />
            </View>

            <View style={styles.signatureActions}>
              <Pressable
                accessibilityRole="button"
                disabled={signatureSaving}
                onPress={() => {
                  signatureRef.current?.clearSignature();
                  setErrorMessage(null);
                }}
                style={({ pressed }) => [
                  styles.signatureSecondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.signatureSecondaryButtonText}>Clear</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={signatureSaving}
                onPress={() => {
                  onSignatureEnd?.();
                  signatureRef.current?.readSignature();
                }}
                style={({ pressed }) => [
                  styles.signatureSaveButton,
                  pressed && styles.buttonPressed,
                  signatureSaving && styles.buttonDisabled,
                ]}
              >
                {signatureSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.signatureSaveButtonText}>
                    Save signature
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.signatureStatusCard}>
            {signatureUploading || signatureSaving ? (
              <>
                <ActivityIndicator />

                <Text style={styles.signatureStatusText}>
                  Saving client signature…
                </Text>
              </>
            ) : signatureUploaded ? (
              <>
                <Text style={styles.signatureSuccessIcon}>✓</Text>

                <View style={styles.flex}>
                  <Text style={styles.signatureSuccessTitle}>
                    Signature saved
                  </Text>

                  <Text style={styles.signatureStatusText}>
                    Client confirmation has been recorded.
                  </Text>
                </View>
              </>
            ) : signatureFailed ? (
              <View style={styles.flex}>
                <Text style={styles.signatureErrorTitle}>
                  Signature upload failed
                </Text>

                {signature.uploadError ? (
                  <Text style={styles.signatureStatusText}>
                    {signature.uploadError}
                  </Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={signatureSaving}
                  onPress={() => {
                    void handleRetrySignature();
                  }}
                  style={({ pressed }) => [
                    styles.retryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.retryButtonText}>
                    Retry signature upload
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.signatureStatusText}>
                Signature is waiting to be uploaded.
              </Text>
            )}
          </View>
        )}
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canComplete}
        onPress={() => {
          void handleComplete();
        }}
        style={({ pressed }) => [
          styles.completeButton,

          pressed && canComplete && styles.buttonPressed,

          !canComplete && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.completeButtonText}>
            Confirm & Complete Service
          </Text>
        )}
      </Pressable>

      {!signatureUploaded ? (
        <Text style={styles.completionHint}>
          Client signature must be saved before the service can be completed.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },

  section: {
    gap: 12,
  },

  sectionTitle: {
    color: "#3d2b1f",
    fontSize: 18,
    fontWeight: "700",
  },

  sectionDescription: {
    color: "#6b5543",
    fontSize: 14,
    lineHeight: 20,
  },

  taskList: {
    gap: 12,
  },

  taskRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },

  check: {
    color: "#38734d",
    fontSize: 17,
    fontWeight: "700",
  },

  taskText: {
    color: "#3d2b1f",
    fontSize: 16,
    fontWeight: "500",
  },

  summaryCard: {
    alignItems: "center",
    backgroundColor: "#f6f2ea",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },

  summaryLabel: {
    color: "#6b5543",
    fontSize: 14,
    fontWeight: "600",
  },

  summaryValue: {
    fontSize: 15,
    fontWeight: "700",
  },

  summaryValueYes: {
    color: "#38734d",
  },

  summaryValueNo: {
    color: "#8a6f53",
  },

  inventoryCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },

  productName: {
    color: "#3d2b1f",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },

  inventoryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },

  inventoryLabel: {
    color: "#6b5543",
    flex: 1,
    fontSize: 14,
  },

  inventoryValue: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "600",
  },

  reserveAfterRow: {
    backgroundColor: "#f6f2ea",
    borderRadius: 8,
    padding: 10,
  },

  reserveAfterLabel: {
    color: "#3d2b1f",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },

  reserveAfterValue: {
    color: "#38734d",
    fontSize: 14,
    fontWeight: "700",
  },

  inventoryDivider: {
    backgroundColor: "#e2d4c0",
    height: 1,
  },

  confirmationText: {
    color: "#6b5543",
    fontSize: 14,
    lineHeight: 21,
  },

  signatureContainer: {
    height: 320,
    overflow: "hidden",
    borderRadius: 12,
  },

  signatureStatusCard: {
    alignItems: "center",
    backgroundColor: "#f6f2ea",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },

  signatureStatusText: {
    color: "#6b5543",
    fontSize: 13,
    lineHeight: 19,
  },

  signatureSuccessIcon: {
    color: "#38734d",
    fontSize: 22,
    fontWeight: "700",
  },

  signatureSuccessTitle: {
    color: "#38734d",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },

  signatureErrorTitle: {
    color: "#8a3324",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },

  retryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#b6692b",
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 42,
    paddingHorizontal: 16,
  },

  retryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  flex: {
    flex: 1,
  },

  completeButton: {
    alignItems: "center",
    backgroundColor: "#b6692b",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 20,
  },

  completeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  completionHint: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 18,
    marginTop: -10,
    textAlign: "center",
  },

  buttonPressed: {
    opacity: 0.85,
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  errorCard: {
    backgroundColor: "#fff6f3",
    borderColor: "#e7b9aa",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },

  errorText: {
    color: "#8a3324",
    fontSize: 14,
  },

  signatureCanvas: {
    height: 320,
    overflow: "hidden",
    borderRadius: 12,
  },

  signatureActions: {
    flexDirection: "row",
    gap: 10,
  },

  signatureSecondaryButton: {
    alignItems: "center",
    backgroundColor: "#fffaf5",
    borderColor: "#b99071",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },

  signatureSecondaryButtonText: {
    color: "#74401f",
    fontSize: 15,
    fontWeight: "700",
  },

  signatureSaveButton: {
    alignItems: "center",
    backgroundColor: "#b6692b",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },

  signatureSaveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
