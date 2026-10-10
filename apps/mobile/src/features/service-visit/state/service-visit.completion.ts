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
      "The service visit can only be completed during Review & Complete.",
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

  /*
   * FLOW-14:
   * Drink Count is required only when the admin assigned
   * the task to this specific route stop.
   */
  if (
    visit.tasks.drinkCountRequired &&
    !visit.drinkCount
  ) {
    throw new Error(
      "Drink Count is required for this service visit.",
    );
  }

  /*
   * FLOW-16:
   * Client Reserve Before Service must exist and
   * be persisted before the visit can be completed.
   */
  if (!visit.inventoryAudit) {
    throw new Error(
      "The client reserve count is missing.",
    );
  }

  if (
    visit.inventoryAudit.syncStatus !== "synced" ||
    !visit.inventoryAudit.databaseId
  ) {
    throw new Error(
      "The client reserve count must finish syncing before completing service.",
    );
  }

  /*
   * FLOW-17:
   * Client Delivery must exist and be persisted.
   *
   * A delivery containing zero actual quantities is
   * still valid; the confirmation record itself must
   * simply have been persisted.
   */
  if (!visit.restockDrop) {
    throw new Error(
      "The client delivery confirmation is missing.",
    );
  }

  if (
    visit.restockDrop.syncStatus !== "synced" ||
    !visit.restockDrop.databaseId
  ) {
    throw new Error(
      "The client delivery must finish syncing before completing service.",
    );
  }

  /*
   * FLOW-18:
   * Machine refill is an independent movement:
   *
   * Driver / Van -> Machine
   *
   * It must be completed and persisted before the
   * final client confirmation.
   */
  if (!visit.machineRefill) {
    throw new Error(
      "The machine refill confirmation is missing.",
    );
  }

  if (
    visit.machineRefill.syncStatus !== "synced" ||
    !visit.machineRefill.databaseId
  ) {
    throw new Error(
      "The machine refill must finish syncing before completing service.",
    );
  }

  /*
   * FLOW-19:
   * Reserve After is derived from:
   *
   * Reserve Before + Actual Client Delivery
   *
   * Machine refill is intentionally excluded.
   */
  if (!visit.reserveAfter) {
    throw new Error(
      "The client reserve-after calculation is missing.",
    );
  }

  if (
    visit.reserveAfter.syncStatus !== "synced" ||
    !visit.reserveAfter.databaseId
  ) {
    throw new Error(
      "The client reserve-after calculation must finish syncing before completing service.",
    );
  }

  /*
   * FLOW-14:
   * After Service requires one completed-machine photo.
   */
  if (!visit.afterService.afterPhoto?.localUri) {
    throw new Error(
      "The required after-service photo is missing.",
    );
  }

  /*
   * FLOW-20:
   * A client or responsible person must sign before
   * the service visit can be completed.
   */
  const signature =
    visit.clientConfirmation.signature;

  if (!signature) {
    throw new Error(
      "Client signature is required before completing service.",
    );
  }

  /*
   * The signature must have been successfully persisted
   * before the visit can be completed.
   */
  if (signature.uploadStatus !== "uploaded") {
    throw new Error(
      "Client signature must finish uploading before completing service.",
    );
  }

  if (
    !signature.databaseId ||
    !signature.storagePath ||
    !signature.uploadedAt
  ) {
    throw new Error(
      "Client signature has not been saved successfully.",
    );
  }

  if (!visit.clientConfirmation.confirmedAt) {
    throw new Error(
      "Client confirmation is incomplete.",
    );
  }

  /*
   * Arrival marks the beginning of the client visit.
   * Signature marks the end.
   */
  const arrivalTime =
    Date.parse(
      visit.arrivalVerification.verifiedAt,
    );

  const signatureTime =
    Date.parse(signature.signedAt);

  if (
    Number.isNaN(arrivalTime) ||
    Number.isNaN(signatureTime) ||
    signatureTime < arrivalTime
  ) {
    throw new Error(
      "The client confirmation timestamp is invalid.",
    );
  }
}