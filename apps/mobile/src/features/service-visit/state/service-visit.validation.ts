import {
  BEFORE_PHOTO_KINDS,
  getRequiredServiceVisitSteps,
  SERVICE_VISIT_STEPS,
  type ServiceVisit,
} from "../service-visit.types";

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

    const configuredProducts = restoredInventoryAudit.configuredProducts;

    const hasValidConfiguredProducts =
      configuredProducts === undefined ||
      (Array.isArray(configuredProducts) &&
        configuredProducts.length > 0 &&
        configuredProducts.every((product) => {
          if (!product || typeof product !== "object") {
            return false;
          }

          const packaging = product.packaging;

          return (
            typeof product.productId === "string" &&
            product.productId.trim().length > 0 &&
            (product.sku === null || typeof product.sku === "string") &&
            typeof product.name === "string" &&
            product.name.trim().length > 0 &&
            typeof product.unitLabel === "string" &&
            typeof product.isRequired === "boolean" &&
            Number.isInteger(product.displayOrder) &&
            (product.parLevel === null ||
              (Number.isFinite(product.parLevel) && product.parLevel >= 0)) &&
            packaging !== null &&
            typeof packaging === "object" &&
            typeof packaging.baseUnit === "string" &&
            packaging.baseUnit.trim().length > 0 &&
            typeof packaging.issueUnit === "string" &&
            packaging.issueUnit.trim().length > 0 &&
            Number.isFinite(packaging.unitsPerIssueUnit) &&
            packaging.unitsPerIssueUnit > 0 &&
            (packaging.packageDescription === null ||
              typeof packaging.packageDescription === "string") &&
            typeof packaging.allowsLooseUnits === "boolean" &&
            typeof packaging.allowsPartialBaseUnit === "boolean"
          );
        }) &&
        new Set(configuredProducts.map((product) => product.productId)).size ===
          configuredProducts.length);

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
      !hasValidConfiguredProducts ||
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

  /*
   * INV-V3-04:
   * Machine Service Confirmation.
   *
   * No product quantities or inventory movements
   * are recorded by this workflow.
   */
  const restoredMachineRefill = visit.machineRefill ?? null;

  let normalizedMachineRefill = restoredMachineRefill;

  if (restoredMachineRefill) {
    const record = restoredMachineRefill as unknown as Record<string, unknown>;

    const validSyncStatuses = ["pending_sync", "synced", "failed"];

    const validOutcomes = ["refilled", "not_needed", "unable_to_refill"];

    const hasValidDatabaseId =
      record.databaseId === null ||
      (typeof record.databaseId === "string" &&
        record.databaseId.trim().length > 0);

    const hasValidSourceVisitId = record.sourceVisitId === visit.id;

    const hasValidConfirmedAt =
      typeof record.confirmedAt === "string" &&
      !Number.isNaN(Date.parse(record.confirmedAt));

    const hasValidSyncStatus = validSyncStatuses.includes(
      record.syncStatus as string,
    );

    const hasValidSyncError =
      record.syncError === null || typeof record.syncError === "string";

    if (
      !hasValidDatabaseId ||
      !hasValidSourceVisitId ||
      !hasValidConfirmedAt ||
      !hasValidSyncStatus ||
      !hasValidSyncError
    ) {
      return null;
    }

    /*
     * Legacy FLOW-18 records contain items instead
     * of an explicit outcome.
     *
     * Only already-synchronized records are accepted.
     * Pending legacy records require a separate
     * recovery strategy to avoid losing stock movements.
     */
    if (Array.isArray(record.items) && record.outcome === undefined) {
      if (
        record.syncStatus !== "synced" ||
        typeof record.databaseId !== "string"
      ) {
        return null;
      }

      const wasRefilled = record.items.some(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          "actualQuantity" in item &&
          typeof item.actualQuantity === "number" &&
          item.actualQuantity > 0,
      );

      normalizedMachineRefill = {
        databaseId: record.databaseId,
        sourceVisitId: visit.id,
        confirmedAt: record.confirmedAt as string,
        outcome: wasRefilled ? "refilled" : "not_needed",
        reason: null,
        syncStatus: "synced",
        syncError: null,
      };
    } else {
      if (!validOutcomes.includes(record.outcome as string)) {
        return null;
      }

      const hasValidReason =
        record.outcome === "unable_to_refill"
          ? typeof record.reason === "string" && record.reason.trim().length > 0
          : record.reason === null;

      if (!hasValidReason) {
        return null;
      }

      normalizedMachineRefill = {
        databaseId: record.databaseId as string | null,
        sourceVisitId: visit.id,
        confirmedAt: record.confirmedAt as string,
        outcome: record.outcome as
          | "refilled"
          | "not_needed"
          | "unable_to_refill",
        reason: record.reason as string | null,
        syncStatus: record.syncStatus as "pending_sync" | "synced" | "failed",
        syncError: record.syncError as string | null,
      };
    }
  }

  /*
   * FLOW-19:
   * Client Reserve After Service.
   *
   * This is a derived snapshot:
   *
   * Reserve After =
   *   Reserve Before + Actual Client Delivery
   *
   * FLOW-18 machine refill is intentionally excluded
   * because machine stock moves directly:
   *
   * Driver / Van -> Machine
   *
   * Older persisted visits created before FLOW-19
   * will not contain reserveAfter. Treat those as null
   * for backwards compatibility.
   */
  const restoredReserveAfter = visit.reserveAfter ?? null;

  if (restoredReserveAfter) {
    const hasValidItems =
      Array.isArray(restoredReserveAfter.items) &&
      restoredReserveAfter.items.every((item) => {
        const hasValidBaseFields =
          typeof item.productId === "string" &&
          item.productId.trim().length > 0 &&
          Number.isFinite(item.reserveBeforeQuantity) &&
          item.reserveBeforeQuantity >= 0 &&
          Number.isFinite(item.deliveredQuantity) &&
          item.deliveredQuantity >= 0 &&
          Number.isFinite(item.reserveAfterQuantity) &&
          item.reserveAfterQuantity >= 0 &&
          typeof item.normalizedUnit === "string" &&
          item.normalizedUnit.trim().length > 0;

        if (!hasValidBaseFields) {
          return false;
        }

        /*
         * FLOW-19 invariant:
         *
         * Reserve After =
         *   Reserve Before + Actual Client Delivery
         *
         * Use a small tolerance because normalized
         * quantities may contain decimal values.
         */
        const expectedReserveAfter =
          item.reserveBeforeQuantity + item.deliveredQuantity;

        const hasValidReserveFormula =
          Math.abs(item.reserveAfterQuantity - expectedReserveAfter) < 0.001;

        return hasValidReserveFormula;
      });

    const hasValidSyncStatus = ["pending_sync", "synced", "failed"].includes(
      restoredReserveAfter.syncStatus,
    );

    const hasValidDatabaseId =
      restoredReserveAfter.databaseId === null ||
      (typeof restoredReserveAfter.databaseId === "string" &&
        restoredReserveAfter.databaseId.trim().length > 0);

    const hasValidSourceVisitId =
      typeof restoredReserveAfter.sourceVisitId === "string" &&
      restoredReserveAfter.sourceVisitId.trim().length > 0;

    /*
     * Prevent a reserve-after record belonging to
     * another visit from being restored here.
     */
    const hasMatchingSourceVisitId =
      restoredReserveAfter.sourceVisitId === visit.id;

    const hasValidCalculatedAt =
      typeof restoredReserveAfter.calculatedAt === "string" &&
      !Number.isNaN(Date.parse(restoredReserveAfter.calculatedAt));

    const hasValidSyncError =
      restoredReserveAfter.syncError === null ||
      typeof restoredReserveAfter.syncError === "string";

    if (
      !hasValidItems ||
      !hasValidSyncStatus ||
      !hasValidDatabaseId ||
      !hasValidSourceVisitId ||
      !hasMatchingSourceVisitId ||
      !hasValidCalculatedAt ||
      !hasValidSyncError
    ) {
      return null;
    }
  }

  /*
   * FLOW-14:
   * After Service contains one required photo.
   *
   * FLOW-20 client confirmation is stored separately
   * from After Service.
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
   * FLOW-20:
   * Client / Manager Confirmation.
   *
   * The signature is intentionally stored separately
   * from After Service. Older persisted visits created
   * before FLOW-20 will not contain clientConfirmation,
   * so normalize them to an empty confirmation.
   */
  const restoredClientConfirmation = visit.clientConfirmation ?? {
    signature: null,
    confirmedAt: null,
  };

  const restoredSignature = restoredClientConfirmation.signature;

  if (restoredSignature) {
    const hasValidLocalUri =
      typeof restoredSignature.localUri === "string" &&
      restoredSignature.localUri.trim().length > 0;

    const hasValidUploadStatus = validUploadStatuses.includes(
      restoredSignature.uploadStatus,
    );

    const hasValidSignedAt =
      typeof restoredSignature.signedAt === "string" &&
      !Number.isNaN(Date.parse(restoredSignature.signedAt));

    const hasValidStoragePath =
      restoredSignature.storagePath === null ||
      (typeof restoredSignature.storagePath === "string" &&
        restoredSignature.storagePath.trim().length > 0);

    const hasValidDatabaseId =
      restoredSignature.databaseId === null ||
      (typeof restoredSignature.databaseId === "string" &&
        restoredSignature.databaseId.trim().length > 0);

    const hasValidUploadError =
      restoredSignature.uploadError === null ||
      typeof restoredSignature.uploadError === "string";

    const hasValidUploadedAt =
      restoredSignature.uploadedAt === null ||
      (typeof restoredSignature.uploadedAt === "string" &&
        !Number.isNaN(Date.parse(restoredSignature.uploadedAt)));

    if (
      !hasValidLocalUri ||
      !hasValidUploadStatus ||
      !hasValidSignedAt ||
      !hasValidStoragePath ||
      !hasValidDatabaseId ||
      !hasValidUploadError ||
      !hasValidUploadedAt
    ) {
      return null;
    }

    /*
     * An uploaded signature must contain the
     * persisted Storage and database references.
     */
    if (
      restoredSignature.uploadStatus === "uploaded" &&
      (restoredSignature.storagePath === null ||
        restoredSignature.databaseId === null ||
        restoredSignature.uploadedAt === null)
    ) {
      return null;
    }
  }

  /*
   * FLOW-20 visit timing invariant:
   *
   * Arrival verification marks the beginning of the
   * client visit and the client signature marks the end.
   *
   * A signature therefore cannot predate arrival.
   */
  if (restoredSignature && visit.arrivalVerification) {
    const arrivalVerifiedAt = Date.parse(visit.arrivalVerification.verifiedAt);

    const signatureSignedAt = Date.parse(restoredSignature.signedAt);

    if (
      Number.isNaN(arrivalVerifiedAt) ||
      signatureSignedAt < arrivalVerifiedAt
    ) {
      return null;
    }
  }

  const hasValidConfirmedAt =
    restoredClientConfirmation.confirmedAt === null ||
    (typeof restoredClientConfirmation.confirmedAt === "string" &&
      !Number.isNaN(Date.parse(restoredClientConfirmation.confirmedAt)));

  if (!hasValidConfirmedAt) {
    return null;
  }

  /*
   * confirmedAt represents a successfully persisted
   * client confirmation. It therefore cannot exist
   * without an uploaded signature.
   */
  if (
    restoredClientConfirmation.confirmedAt !== null &&
    (!restoredSignature || restoredSignature.uploadStatus !== "uploaded")
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

    reserveAfter: restoredReserveAfter,

    afterService: restoredAfterService,

    clientConfirmation: restoredClientConfirmation,

    summary: restoredSummary,
  };
}
