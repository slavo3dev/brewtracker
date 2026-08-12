import {
  BEFORE_PHOTO_KINDS,
  SERVICE_VISIT_STEPS,
  type ServiceVisit,
} from "../service-visit.types";

export function validateRestoredVisit(
  visit: ServiceVisit,
  userId: string,
): ServiceVisit | null {
  if (visit.userId !== userId) {
    return null;
  }

  if (!visit.id || !visit.routeId || !visit.stopId) {
    return null;
  }

  if (!visit.target || !visit.machineTarget) {
    return null;
  }

  const validMachineStatuses = [
    "active",
    "inactive",
    "maintenance",
    "retired",
  ] as const;

  const hasValidMachineStatus = validMachineStatuses.includes(
    visit.machineTarget.status as (typeof validMachineStatuses)[number],
  );

  if (
    typeof visit.machineTarget.id !== "string" ||
    visit.machineTarget.id.trim().length === 0 ||
    typeof visit.machineTarget.qrCode !== "string" ||
    visit.machineTarget.qrCode.trim().length === 0 ||
    visit.machineTarget.id !== visit.machineId ||
    !hasValidMachineStatus
  ) {
    return null;
  }

  const hasValidLatitude =
    typeof visit.target.latitude === "number" &&
    Number.isFinite(visit.target.latitude) &&
    visit.target.latitude >= -90 &&
    visit.target.latitude <= 90;

  const hasValidLongitude =
    typeof visit.target.longitude === "number" &&
    Number.isFinite(visit.target.longitude) &&
    visit.target.longitude >= -180 &&
    visit.target.longitude <= 180;

  const hasValidRadius =
    typeof visit.target.geofenceRadiusMeters === "number" &&
    Number.isFinite(visit.target.geofenceRadiusMeters) &&
    visit.target.geofenceRadiusMeters > 0;

  if (
    typeof visit.target.clientName !== "string" ||
    visit.target.clientName.trim().length === 0 ||
    !hasValidLatitude ||
    !hasValidLongitude ||
    !hasValidRadius
  ) {
    return null;
  }

  if (
    !SERVICE_VISIT_STEPS.some((step) => step.id === visit.currentStep) ||
    !Array.isArray(visit.steps) ||
    visit.steps.length !== SERVICE_VISIT_STEPS.length
  ) {
    return null;
  }

  const hasExpectedSteps = SERVICE_VISIT_STEPS.every(
    (expectedStep, index) => visit.steps[index]?.id === expectedStep.id,
  );

  if (!hasExpectedSteps) {
    return null;
  }

  const restoredBeforePhotos = Array.isArray(visit.beforePhotos)
    ? visit.beforePhotos
    : [];

  const hasValidBeforePhotos = restoredBeforePhotos.every((photo) => {
    const hasValidKind = BEFORE_PHOTO_KINDS.includes(photo.kind);

    const hasValidLocalUri =
      typeof photo.localUri === "string" && photo.localUri.trim().length > 0;

    const hasValidStatus = [
      "pending_upload",
      "uploading",
      "uploaded",
      "failed",
    ].includes(photo.uploadStatus);

    return hasValidKind && hasValidLocalUri && hasValidStatus;
  });

  if (!hasValidBeforePhotos) {
    return null;
  }

  const restoredMeterReading = visit.meterReading ?? null;

  if (restoredMeterReading) {
    const hasValidReading =
      Number.isSafeInteger(restoredMeterReading.reading) &&
      restoredMeterReading.reading >= 0;

    const hasValidPreviousReading =
      restoredMeterReading.previousReading === null ||
      (Number.isSafeInteger(restoredMeterReading.previousReading) &&
        restoredMeterReading.previousReading >= 0);

    const hasValidDelta =
      restoredMeterReading.delta === null ||
      (Number.isSafeInteger(restoredMeterReading.delta) &&
        restoredMeterReading.delta >= 0);

    if (
      typeof restoredMeterReading.databaseId !== "string" ||
      restoredMeterReading.databaseId.trim().length === 0 ||
      typeof restoredMeterReading.sourceVisitId !== "string" ||
      restoredMeterReading.sourceVisitId.trim().length === 0 ||
      typeof restoredMeterReading.recordedAt !== "string" ||
      !hasValidReading ||
      !hasValidPreviousReading ||
      !hasValidDelta
    ) {
      return null;
    }
  }

  const restoredInventoryAudit = visit.inventoryAudit ?? null;

  if (restoredInventoryAudit) {
    const hasValidItems =
      Array.isArray(restoredInventoryAudit.items) &&
      restoredInventoryAudit.items.length > 0 &&
      restoredInventoryAudit.items.every(
        (item) =>
          typeof item.productId === "string" &&
          item.productId.trim().length > 0 &&
          typeof item.name === "string" &&
          typeof item.unitLabel === "string" &&
          Number.isFinite(item.quantity) &&
          item.quantity >= 0,
      );

    const hasValidSyncStatus = ["pending_sync", "synced", "failed"].includes(
      restoredInventoryAudit.syncStatus,
    );

    if (
      typeof restoredInventoryAudit.sourceVisitId !== "string" ||
      typeof restoredInventoryAudit.countedAt !== "string" ||
      !hasValidItems ||
      !hasValidSyncStatus
    ) {
      return null;
    }
  }

  const restoredRestockDrop = visit.restockDrop ?? null;

  if (restoredRestockDrop) {
    const hasValidItems =
      Array.isArray(restoredRestockDrop.items) &&
      restoredRestockDrop.items.length > 0 &&
      restoredRestockDrop.items.every(
        (item) =>
          typeof item.productId === "string" &&
          item.productId.trim().length > 0 &&
          typeof item.name === "string" &&
          typeof item.unitLabel === "string" &&
          Number.isFinite(item.countedQuantity) &&
          item.countedQuantity >= 0 &&
          Number.isFinite(item.parLevel) &&
          item.parLevel >= 0 &&
          Number.isFinite(item.recommendedQuantity) &&
          item.recommendedQuantity >= 0 &&
          Number.isFinite(item.actualQuantity) &&
          item.actualQuantity >= 0,
      );

    const hasValidSyncStatus = ["pending_sync", "synced", "failed"].includes(
      restoredRestockDrop.syncStatus,
    );

    if (
      typeof restoredRestockDrop.sourceVisitId !== "string" ||
      restoredRestockDrop.sourceVisitId.trim().length === 0 ||
      typeof restoredRestockDrop.inventoryAuditId !== "string" ||
      restoredRestockDrop.inventoryAuditId.trim().length === 0 ||
      typeof restoredRestockDrop.confirmedAt !== "string" ||
      !hasValidItems ||
      !hasValidSyncStatus
    ) {
      return null;
    }
  }

  const signatureRequired =
    typeof visit.target.signatureRequired === "boolean"
      ? visit.target.signatureRequired
      : true;

  const restoredAfterService = visit.afterService ?? {
    afterPhoto: null,
    signature: null,
    signatureRequired,
    signatureBypassedAt: null,
  };

  const validUploadStatuses = [
    "pending_upload",
    "uploading",
    "uploaded",
    "failed",
  ];

  if (
    restoredAfterService.afterPhoto &&
    (!restoredAfterService.afterPhoto.localUri?.trim() ||
      !validUploadStatuses.includes(
        restoredAfterService.afterPhoto.uploadStatus,
      ))
  ) {
    return null;
  }

  if (
    restoredAfterService.signature &&
    (!restoredAfterService.signature.localUri?.trim() ||
      !validUploadStatuses.includes(
        restoredAfterService.signature.uploadStatus,
      ))
  ) {
    return null;
  }

  return {
    ...visit,
    target: {
      ...visit.target,
      signatureRequired,
    },
    beforePhotos: restoredBeforePhotos,
    meterReading: restoredMeterReading,
    inventoryAudit: restoredInventoryAudit,
    restockDrop: restoredRestockDrop,
    afterService: {
      ...restoredAfterService,
      signatureRequired,
    },
  };
}
