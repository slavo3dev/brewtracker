import {
  BEFORE_PHOTO_KINDS,
  type ServiceVisit,
} from "../service-visit.types";

export function assertVisitReadyForCompletion(
  visit: ServiceVisit,
): void {
  if (visit.status !== "in_progress") {
    throw new Error(
      "Only an active service visit can be completed.",
    );
  }

  if (visit.currentStep !== "summary") {
    throw new Error(
      "The service visit can only be completed during Step 8.",
    );
  }

  if (!visit.arrivalVerification) {
    throw new Error(
      "Arrival verification is missing.",
    );
  }

  if (!visit.machineScanVerification) {
    throw new Error(
      "The initial machine verification is missing.",
    );
  }

  const beforeKinds = new Set(
    visit.beforePhotos.map((photo) => photo.kind),
  );

  const hasAllBeforePhotos =
    BEFORE_PHOTO_KINDS.every((kind) =>
      beforeKinds.has(kind),
    );

  if (!hasAllBeforePhotos) {
    throw new Error(
      "Required before-service photos are missing.",
    );
  }

  if (!visit.meterReading) {
    throw new Error(
      "The machine meter reading is missing.",
    );
  }

  if (!visit.inventoryAudit) {
    throw new Error(
      "The inventory audit is missing.",
    );
  }

  if (!visit.restockDrop) {
    throw new Error(
      "The restock confirmation is missing.",
    );
  }

  if (!visit.afterService.afterPhoto?.localUri) {
    throw new Error(
      "The required after-service photo is missing.",
    );
  }

  if (
    visit.afterService.signatureRequired &&
    !visit.afterService.signature?.localUri
  ) {
    throw new Error(
      "This client requires a signature.",
    );
  }

  if (
    !visit.afterService.signatureRequired &&
    !visit.afterService.signature &&
    !visit.afterService.signatureBypassedAt
  ) {
    throw new Error(
      "The optional signature decision was not recorded.",
    );
  }

  const closingVerification =
    visit.summary.closingVerification;

  if (!closingVerification) {
    throw new Error(
      "Scan the machine again before completing service.",
    );
  }

  if (
    closingVerification.machineId !==
    visit.machineId
  ) {
    throw new Error(
      "The closing scan does not belong to the assigned machine.",
    );
  }

  if (
    closingVerification.scannedValue !==
    visit.machineTarget.qrCode.trim()
  ) {
    throw new Error(
      "The closing QR code does not match the assigned machine.",
    );
  }
}