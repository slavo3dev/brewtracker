import {
  BEFORE_PHOTO_KINDS,
  getRequiredServiceVisitSteps,
  SERVICE_VISIT_STEPS,
  type MachineRefillZeroReason,
  type ServiceVisit,
} from "../service-visit.types";

const MACHINE_REFILL_ZERO_REASONS = new Set<MachineRefillZeroReason>([
  "refill_not_required",
  "product_unavailable",
  "machine_issue",
  "other",
]);

function migratePreFlow18Visit(visit: ServiceVisit): ServiceVisit {
  if (!Array.isArray(visit.steps)) {
    return visit;
  }

  /*
   * Already using the FLOW-18 step structure.
   */
  if (visit.steps.some((step) => step.id === "machine_refill")) {
    return visit;
  }

  const restockIndex = visit.steps.findIndex((step) => step.id === "restock");

  const afterServiceIndex = visit.steps.findIndex(
    (step) => step.id === "after_service",
  );

  /*
   * Only migrate the known pre-FLOW-18 structure:
   *
   * restock -> after_service
   *
   * Anything else should continue to fail normal
   * restore validation.
   */
  if (restockIndex < 0 || afterServiceIndex !== restockIndex + 1) {
    return visit;
  }

  const restockStep = visit.steps[restockIndex];

  const hasProgressedPastRestock =
    restockStep?.status === "completed" ||
    visit.currentStep === "after_service" ||
    visit.currentStep === "summary";

  const machineRefillStep = {
    id: "machine_refill" as const,
    status: "locked" as const,
    completedAt: null,
  };

  const migratedSteps = [
    ...visit.steps.slice(0, afterServiceIndex),

    machineRefillStep,

    ...visit.steps.slice(afterServiceIndex),
  ];

  /*
   * If the old visit had already completed Restock,
   * the new FLOW-18 step becomes the current step.
   *
   * Downstream steps are locked again because
   * Machine Refill is now required before them.
   */
  if (hasProgressedPastRestock) {
    const resetSteps = migratedSteps.map((step) => {
      if (step.id === "machine_refill") {
        return {
          ...step,
          status: "current" as const,
          completedAt: null,
        };
      }

      if (step.id === "after_service" || step.id === "summary") {
        return {
          ...step,
          status: "locked" as const,
          completedAt: null,
        };
      }

      return step;
    });

    return {
      ...visit,

      currentStep: "machine_refill",

      steps: resetSteps,

      machineRefill: null,

      /*
       * An old After Service photo may have been
       * captured before the newly required machine
       * refill. Require it again after FLOW-18.
       */
      afterService: {
        afterPhoto: null,
      },
    };
  }

  /*
   * The old visit has not passed Restock yet.
   *
   * Insert FLOW-18 as a locked future step.
   * Normal transition logic will unlock it after
   * Client Delivery is completed.
   */
  return {
    ...visit,

    steps: migratedSteps,

    machineRefill: null,
  };
}

export function validateRestoredVisit(
  visit: ServiceVisit,
  userId: string,
): ServiceVisit | null {
  visit = migratePreFlow18Visit(visit);

  if (visit.userId !== userId) {
    return null;
  }

  if (!visit.id || !visit.routeId || !visit.stopId) {
    return null;
  }

  if (!visit.target || !visit.machineTarget || !visit.tasks) {
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

  /*
   * FLOW-14:
   * Drink Count is configured per route stop.
   */
  if (typeof visit.tasks.drinkCountRequired !== "boolean") {
    return null;
  }

  const requiredSteps = getRequiredServiceVisitSteps(visit.tasks);

  if (
    !SERVICE_VISIT_STEPS.some((step) => step.id === visit.currentStep) ||
    !Array.isArray(visit.steps) ||
    visit.steps.length !== requiredSteps.length
  ) {
    return null;
  }

  const hasExpectedSteps = requiredSteps.every(
    (expectedStep, index) => visit.steps[index]?.id === expectedStep.id,
  );

  if (!hasExpectedSteps) {
    return null;
  }

  if (!visit.steps.some((step) => step.id === visit.currentStep)) {
    return null;
  }

  /*
   * Before-service photos
   */
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

  /*
   * FLOW-14 Drink Count.
   *
   * Running Total is entered by the driver.
   * Archive Total is calculated automatically.
   */
  const restoredDrinkCount = visit.drinkCount ?? null;

  if (restoredDrinkCount) {
    const hasValidRunningTotal =
      Number.isSafeInteger(restoredDrinkCount.runningTotal) &&
      restoredDrinkCount.runningTotal >= 0;

    const hasValidArchiveTotal =
      Number.isSafeInteger(restoredDrinkCount.archiveTotal) &&
      restoredDrinkCount.archiveTotal >= 0;

    if (
      typeof restoredDrinkCount.databaseId !== "string" ||
      restoredDrinkCount.databaseId.trim().length === 0 ||
      typeof restoredDrinkCount.sourceVisitId !== "string" ||
      restoredDrinkCount.sourceVisitId.trim().length === 0 ||
      typeof restoredDrinkCount.recordedAt !== "string" ||
      !hasValidRunningTotal ||
      !hasValidArchiveTotal
    ) {
      return null;
    }
  }

  /*
   * Drink Count cannot exist if the task wasn't
   * configured for this stop.
   */
  if (!visit.tasks.drinkCountRequired && restoredDrinkCount) {
    return null;
  }

  /*
   * FLOW-16:
   * Client Reserve Before Service.
   *
   * The local property name `inventoryAudit` is retained
   * for persisted visit compatibility, but it now stores
   * the V2 client reserve count.
   */
  const restoredInventoryAudit = visit.inventoryAudit ?? null;

  if (restoredInventoryAudit) {
    const hasValidItems =
      Array.isArray(restoredInventoryAudit.items) &&
      restoredInventoryAudit.items.length > 0 &&
      restoredInventoryAudit.items.every(
        (item) =>
          typeof item.productId === "string" &&
          item.productId.trim().length > 0 &&
          (item.sku === null || typeof item.sku === "string") &&
          typeof item.name === "string" &&
          typeof item.unitLabel === "string" &&
          Number.isFinite(item.issueQuantity) &&
          item.issueQuantity >= 0 &&
          Number.isInteger(item.issueQuantity) &&
          Number.isFinite(item.looseQuantity) &&
          item.looseQuantity >= 0 &&
          Number.isFinite(item.normalizedQuantity) &&
          item.normalizedQuantity >= 0 &&
          typeof item.normalizedUnit === "string" &&
          item.normalizedUnit.trim().length > 0 &&
          (item.previousReserveAfter === null ||
            (Number.isFinite(item.previousReserveAfter) &&
              item.previousReserveAfter >= 0)) &&
          (item.reserveDecrease === null ||
            Number.isFinite(item.reserveDecrease)),
      );

    const hasValidSyncStatus = ["pending_sync", "synced", "failed"].includes(
      restoredInventoryAudit.syncStatus,
    );

    const hasValidDatabaseId =
      restoredInventoryAudit.databaseId === null ||
      (typeof restoredInventoryAudit.databaseId === "string" &&
        restoredInventoryAudit.databaseId.trim().length > 0);

    const hasValidSyncError =
      restoredInventoryAudit.syncError === null ||
      typeof restoredInventoryAudit.syncError === "string";

    if (
      !hasValidDatabaseId ||
      typeof restoredInventoryAudit.sourceVisitId !== "string" ||
      restoredInventoryAudit.sourceVisitId.trim().length === 0 ||
      typeof restoredInventoryAudit.countedAt !== "string" ||
      !hasValidItems ||
      !hasValidSyncStatus ||
      !hasValidSyncError
    ) {
      return null;
    }
  }

  /*
   * FLOW-17:
   * Client Delivery.
   *
   * `restockDrop` is retained as the local property name
   * for persisted visit compatibility.
   *
   * An empty items array is valid when no products require
   * delivery.
   *
   * Actual delivery may also be zero when delivery is
   * recommended but the driver does not have stock
   * available.
   */
  const restoredRestockDrop = visit.restockDrop ?? null;

  if (restoredRestockDrop) {
    const hasValidItems =
      Array.isArray(restoredRestockDrop.items) &&
      restoredRestockDrop.items.every(
        (item) =>
          typeof item.productId === "string" &&
          item.productId.trim().length > 0 &&
          (item.sku === null || typeof item.sku === "string") &&
          typeof item.name === "string" &&
          typeof item.unitLabel === "string" &&
          Number.isFinite(item.reserveBeforeQuantity) &&
          item.reserveBeforeQuantity >= 0 &&
          Number.isFinite(item.parLevel) &&
          item.parLevel >= 0 &&
          Number.isFinite(item.recommendedQuantity) &&
          item.recommendedQuantity > 0 &&
          Number.isFinite(item.issueQuantity) &&
          item.issueQuantity >= 0 &&
          Number.isInteger(item.issueQuantity) &&
          Number.isFinite(item.looseQuantity) &&
          item.looseQuantity >= 0 &&
          Number.isFinite(item.actualQuantity) &&
          item.actualQuantity >= 0 &&
          typeof item.normalizedUnit === "string" &&
          item.normalizedUnit.trim().length > 0,
      );

    const hasValidSyncStatus = ["pending_sync", "synced", "failed"].includes(
      restoredRestockDrop.syncStatus,
    );

    const hasValidDatabaseId =
      restoredRestockDrop.databaseId === null ||
      (typeof restoredRestockDrop.databaseId === "string" &&
        restoredRestockDrop.databaseId.trim().length > 0);

    const hasValidSyncError =
      restoredRestockDrop.syncError === null ||
      typeof restoredRestockDrop.syncError === "string";

    if (
      !hasValidDatabaseId ||
      typeof restoredRestockDrop.sourceVisitId !== "string" ||
      restoredRestockDrop.sourceVisitId.trim().length === 0 ||
      typeof restoredRestockDrop.confirmedAt !== "string" ||
      !hasValidItems ||
      !hasValidSyncStatus ||
      !hasValidSyncError
    ) {
      return null;
    }
  }

  /*
   * FLOW-18:
   * Machine refill.
   *
   * Stock is moved directly:
   *
   * Driver / Van -> Machine
   *
   * It does not reduce client reserve.
   *
   * FLOW-18 QA:
   * Older persisted visits may not contain
   * zeroReason / zeroReasonNote. Missing values
   * are normalized to null for compatibility.
   */
  const restoredMachineRefill = visit.machineRefill ?? null;

  const normalizedMachineRefill = restoredMachineRefill
    ? {
        ...restoredMachineRefill,

        items: Array.isArray(restoredMachineRefill.items)
          ? restoredMachineRefill.items.map((item) => ({
              ...item,

              zeroReason: item.zeroReason ?? null,

              zeroReasonNote: item.zeroReasonNote ?? null,
            }))
          : restoredMachineRefill.items,
      }
    : null;

  if (normalizedMachineRefill) {
    const hasValidItems =
      Array.isArray(normalizedMachineRefill.items) &&
      normalizedMachineRefill.items.every((item) => {
        const hasValidBaseFields =
          typeof item.productId === "string" &&
          item.productId.trim().length > 0 &&
          (item.sku === null || typeof item.sku === "string") &&
          typeof item.name === "string" &&
          typeof item.unitLabel === "string" &&
          Number.isFinite(item.issueQuantity) &&
          item.issueQuantity >= 0 &&
          Number.isInteger(item.issueQuantity) &&
          Number.isFinite(item.looseQuantity) &&
          item.looseQuantity >= 0 &&
          Number.isFinite(item.actualQuantity) &&
          item.actualQuantity >= 0 &&
          typeof item.normalizedUnit === "string" &&
          item.normalizedUnit.trim().length > 0;

        if (!hasValidBaseFields) {
          return false;
        }

        const hasValidZeroReason =
          item.zeroReason === null ||
          MACHINE_REFILL_ZERO_REASONS.has(item.zeroReason);

        if (!hasValidZeroReason) {
          return false;
        }

        const hasValidZeroReasonNote =
          item.zeroReasonNote === null ||
          typeof item.zeroReasonNote === "string";

        if (!hasValidZeroReasonNote) {
          return false;
        }

        /*
         * Positive refill quantities cannot
         * carry zero-refill metadata.
         */
        if (
          item.actualQuantity > 0 &&
          (item.zeroReason !== null || item.zeroReasonNote !== null)
        ) {
          return false;
        }

        /*
         * A note only belongs to the "other"
         * reason.
         */
        if (item.zeroReason !== "other" && item.zeroReasonNote !== null) {
          return false;
        }

        /*
         * Selecting Other requires a
         * meaningful explanation.
         */
        if (
          item.zeroReason === "other" &&
          (item.zeroReasonNote === null ||
            item.zeroReasonNote.trim().length === 0)
        ) {
          return false;
        }

        return true;
      });

    const hasValidSyncStatus = ["pending_sync", "synced", "failed"].includes(
      normalizedMachineRefill.syncStatus,
    );

    const hasValidDatabaseId =
      normalizedMachineRefill.databaseId === null ||
      (typeof normalizedMachineRefill.databaseId === "string" &&
        normalizedMachineRefill.databaseId.trim().length > 0);

    const hasValidSyncError =
      normalizedMachineRefill.syncError === null ||
      typeof normalizedMachineRefill.syncError === "string";

    if (
      !hasValidDatabaseId ||
      typeof normalizedMachineRefill.sourceVisitId !== "string" ||
      normalizedMachineRefill.sourceVisitId.trim().length === 0 ||
      typeof normalizedMachineRefill.confirmedAt !== "string" ||
      !hasValidItems ||
      !hasValidSyncStatus ||
      !hasValidSyncError
    ) {
      return null;
    }
  }

  /*
   * FLOW-14:
   * After Service contains one required photo.
   * Signature state has been removed.
   */
  const restoredAfterService = visit.afterService ?? {
    afterPhoto: null,
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

  /*
   * FLOW-10/FLOW-14:
   * Closing QR verification is no longer part of the
   * final summary.
   */
  const restoredSummary = visit.summary ?? {
    syncStatus: "not_started" as const,

    syncError: null,

    databaseId: null,

    surveyToken: null,

    emailSentAt: null,
  };

  return {
    ...visit,

    beforePhotos: restoredBeforePhotos,

    drinkCount: restoredDrinkCount,

    inventoryAudit: restoredInventoryAudit,

    restockDrop: restoredRestockDrop,

    machineRefill: normalizedMachineRefill,

    afterService: restoredAfterService,

    summary: restoredSummary,
  };
}
