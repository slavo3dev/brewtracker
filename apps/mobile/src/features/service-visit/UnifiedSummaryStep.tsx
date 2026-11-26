import { useRef, useState } from "react";
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
import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";

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

type UnifiedSummaryStepProps = {
  onSignatureStart?: () => void;
  onSignatureEnd?: () => void;
};

export default function UnifiedSummaryStep({
  onSignatureStart,
  onSignatureEnd,
}: UnifiedSummaryStepProps) {
  const {
    unifiedVisit,
    saveUnifiedSignature,
    updateUnifiedSignatureUpload,
    completeUnifiedSummary,
  } = useServiceVisit();

  const signatureRef = useRef<SignatureViewRef | null>(null);
  const signatureOperationRef = useRef(false);

  const [signatureSaving, setSignatureSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!unifiedVisit || unifiedVisit.currentStep !== "summary") {
    return null;
  }

  const visit = unifiedVisit;
  const signature = visit.clientConfirmation.signature;
  const signatureLocked = Boolean(signature) || signatureSaving || submitting;

  const canComplete =
    signature?.uploadStatus === "uploaded" &&
    Boolean(signature.databaseId) &&
    Boolean(signature.storagePath) &&
    Boolean(signature.uploadedAt) &&
    Boolean(visit.clientConfirmation.confirmedAt) &&
    !signatureSaving &&
    !submitting;

  function getProductName(productId: string): string {
    return (
      visit.inventoryAudit?.items.find((item) => item.productId === productId)
        ?.name ??
      visit.restockDrop?.items.find((item) => item.productId === productId)
        ?.name ??
      "Product"
    );
  }

  async function uploadSavedSignature(
    savedVisit: MultiMachineServiceVisit,
  ): Promise<void> {
    const signature = savedVisit.clientConfirmation.signature;

    if (!signature) {
      throw new Error("The saved client signature could not be found.");
    }

    try {
      await updateUnifiedSignatureUpload(signature.localUri, {
        uploadStatus: "uploading",
        uploadError: null,
      });

      const uploaded = await uploadSignature({
        userId: savedVisit.userId,
        visitId: savedVisit.id,
        stopId: savedVisit.stopId,
        clientId: savedVisit.clientId,
        machineId: null,
        localUri: signature.localUri,
        signedAt: signature.signedAt,
      });

      await updateUnifiedSignatureUpload(signature.localUri, {
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
        await updateUnifiedSignatureUpload(signature.localUri, {
          uploadStatus: "failed",
          uploadError: message,
        });
      } catch {
        // The signature may have changed while uploading.
      }

      setErrorMessage(message);
      throw error;
    }
  }

  async function handleSignature(dataUrl: string): Promise<void> {
    if (signatureOperationRef.current || signatureSaving) {
      return;
    }

    signatureOperationRef.current = true;
    setSignatureSaving(true);
    setErrorMessage(null);

    try {
      const signedAt = new Date().toISOString();

      // Save the signature image on the device first.
      const localUri = await persistSignatureLocally(visit.id, dataUrl);

      // Persist the signature reference in the unified visit.
      const savedVisit = await saveUnifiedSignature({
        localUri,
        signedAt,
      });

      // Attempt Supabase synchronization.
      await uploadSavedSignature(savedVisit);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the client signature.",
      );
    } finally {
      signatureOperationRef.current = false;
      setSignatureSaving(false);
    }
  }

  async function handleRetrySignature(): Promise<void> {
    const signature = visit.clientConfirmation.signature;

    if (
      !signature ||
      signatureOperationRef.current ||
      signatureSaving ||
      signature.uploadStatus === "uploaded"
    ) {
      return;
    }

    signatureOperationRef.current = true;
    setSignatureSaving(true);
    setErrorMessage(null);

    try {
      await uploadSavedSignature(visit);
    } catch {
      // uploadSavedSignature already records the error.
    } finally {
      setSignatureSaving(false);
      signatureOperationRef.current = false;
    }
  }

  async function handleComplete(): Promise<void> {
    if (submitting || signatureSaving) {
      return;
    }

    const signature = visit.clientConfirmation.signature;

    if (
      !signature ||
      signature.uploadStatus !== "uploaded" ||
      !signature.databaseId ||
      !signature.storagePath ||
      !signature.uploadedAt ||
      !visit.clientConfirmation.confirmedAt
    ) {
      setErrorMessage(
        "The client signature must finish uploading before completion.",
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeUnifiedSummary();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to synchronize the completed service visit.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Consolidated Service Summary</Text>

      <Text style={styles.description}>
        {visit.machines.length} machine(s) serviced at {visit.target.clientName}
        .
      </Text>

      <Text style={styles.sectionTitle}>Machine services</Text>

      {visit.machines.map((machine, index) => (
        <View key={machine.machineId} style={styles.card}>
          <Text style={styles.machineTitle}>
            Machine {index + 1}:{" "}
            {machine.machineTarget.name ??
              machine.machineTarget.model ??
              machine.machineTarget.serialNumber ??
              machine.machineId}
          </Text>

          <Text style={styles.description}>
            Service: {machine.machineRefill?.outcome ?? "Not confirmed"}
          </Text>

          <Text style={styles.description}>
            Drink Count:{" "}
            {machine.drinkCountRequired
              ? (machine.drinkCount?.runningTotal ?? "Not recorded")
              : "Not required"}
          </Text>

          <Text style={styles.description}>
            Completed: {machine.completedAt ? "Yes" : "No"}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Client inventory</Text>

      {visit.reserveAfter?.items.map((item) => (
        <View key={item.productId} style={styles.card}>
          <Text style={styles.machineTitle}>
            {getProductName(item.productId)}
          </Text>

          <Text style={styles.description}>
            Reserve before: {item.reserveBeforeQuantity} {item.normalizedUnit}
          </Text>

          <Text style={styles.description}>
            Delivered: {item.deliveredQuantity} {item.normalizedUnit}
          </Text>

          <Text style={styles.description}>
            Reserve after: {item.reserveAfterQuantity} {item.normalizedUnit}
          </Text>
        </View>
      ))}
      <Text style={styles.sectionTitle}>Client Signature</Text>

      <Text style={styles.description}>
        Please ask the client to review the service summary and sign below.
      </Text>

      <View
        style={styles.signatureContainer}
        pointerEvents={signatureLocked ? "none" : "auto"}
      >
        <SignatureCanvas
          ref={signatureRef}
          onOK={handleSignature}
          onBegin={onSignatureStart}
          onEnd={onSignatureEnd}
          onEmpty={() =>
            setErrorMessage("Please provide a signature before saving.")
          }
          autoClear={false}
          descriptionText=""
          webStyle={SIGNATURE_WEB_STYLE}
        />
      </View>

      <Pressable
        style={styles.signatureButton}
        onPress={() => signatureRef.current?.readSignature()}
        disabled={signatureLocked}
      >
        <Text style={styles.signatureButtonText}>
          {signatureSaving ? "Saving Signature..." : "Save Signature"}
        </Text>
      </Pressable>

      <Pressable
        style={styles.clearButton}
        onPress={() => signatureRef.current?.clearSignature()}
        disabled={signatureLocked}
      >
        <Text style={styles.clearButtonText}>Clear Signature</Text>
      </Pressable>

      {signature ? (
        <View style={styles.signatureStatus}>
          {signature.uploadStatus === "uploaded" ? (
            <Text style={styles.signatureSuccess}>
              Client signature uploaded successfully.
            </Text>
          ) : signature.uploadStatus === "uploading" ? (
            <View style={styles.signatureStatus}>
              {signatureSaving ? (
                <View style={styles.signatureStatusRow}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.description}>
                    Uploading client signature...
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.description}>
                    The previous signature upload was interrupted.
                  </Text>

                  <Pressable
                    style={styles.signatureButton}
                    onPress={handleRetrySignature}
                    disabled={signatureSaving || submitting}
                  >
                    <Text style={styles.signatureButtonText}>
                      Retry Signature Upload
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : signature.uploadStatus === "failed" ? (
            <>
              <Text style={styles.errorText}>
                Signature saved locally. Upload failed.
              </Text>

              <Pressable
                style={styles.signatureButton}
                onPress={handleRetrySignature}
                disabled={signatureSaving || submitting}
              >
                <Text style={styles.signatureButtonText}>
                  Retry Signature Upload
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.description}>
                Signature saved locally. Ready to upload.
              </Text>

              <Pressable
                style={styles.signatureButton}
                onPress={handleRetrySignature}
                disabled={signatureSaving || submitting}
                accessibilityRole="button"
              >
                <Text style={styles.signatureButtonText}>
                  Upload Saved Signature
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <Pressable
        style={[
          styles.completeButton,
          !canComplete && styles.completeButtonDisabled,
        ]}
        onPress={handleComplete}
        disabled={!canComplete}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canComplete }}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text style={styles.completeButtonText}>
            Confirm & Complete Service
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  title: {
    color: "#3d2b1f",
    fontSize: 20,
    fontWeight: "700",
  },
  sectionTitle: {
    color: "#3d2b1f",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
  },
  description: {
    color: "#6b5543",
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  machineTitle: {
    color: "#3d2b1f",
    fontSize: 16,
    fontWeight: "700",
  },
  signatureContainer: {
    height: 220,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
  },
  signatureButton: {
    backgroundColor: "#a66b43",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  signatureButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  clearButton: {
    borderColor: "#a66b43",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  clearButtonText: {
    color: "#a66b43",
    fontSize: 15,
    fontWeight: "600",
  },
  errorText: {
    color: "#b42318",
    fontSize: 14,
  },
  signatureStatus: {
    gap: 10,
    marginTop: 8,
  },
  signatureStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  signatureSuccess: {
    color: "#15803d",
    fontSize: 14,
    fontWeight: "600",
  },
  completeButton: {
    backgroundColor: "#3d2b1f",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  completeButtonDisabled: {
    opacity: 0.45,
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
