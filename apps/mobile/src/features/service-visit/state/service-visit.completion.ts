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

  /*
   * FLOW-14:
   * After Service requires exactly one completed-machine photo.
   */
  if (!visit.afterService.afterPhoto?.localUri) {
    throw new Error(
      "The required after-service photo is missing.",
    );
  }
}