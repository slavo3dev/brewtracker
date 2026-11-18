import { getRequiredMachineSteps } from "./multi-machine-visit.transitions";
import { BEFORE_PHOTO_KINDS } from "../service-visit.types";

import type {
  MultiMachineServiceVisit,
  MultiMachineVisitStepId,
} from "../multi-machine-visit.types";

const VISIT_STEPS: MultiMachineVisitStepId[] = [
  "arrival",
  "inventory_audit",
  "restock",
  "machine_service",
  "reserve_after",
  "summary",
];

export function validateRestoredMultiMachineVisit(
  value: unknown,
  userId: string,
): MultiMachineServiceVisit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const visit = value as Partial<MultiMachineServiceVisit>;

  if (
    visit.schemaVersion !== 2 ||
    visit.userId !== userId ||
    typeof visit.id !== "string" ||
    !visit.id.trim() ||
    typeof visit.routeId !== "string" ||
    !visit.routeId.trim() ||
    typeof visit.stopId !== "string" ||
    !visit.stopId.trim() ||
    typeof visit.clientId !== "string" ||
    !visit.clientId.trim()
  ) {
    return null;
  }

  if (
    !visit.currentStep ||
    !VISIT_STEPS.includes(visit.currentStep) ||
    !["in_progress", "completed", "cancelled"].includes(
      visit.status ?? "",
    )
  ) {
    return null;
  }

  if (!Array.isArray(visit.machines) || visit.machines.length < 2) {
    return null;
  }

  const machineIds = new Set<string>();
  const sequenceNumbers = new Set<number>();

  for (const machine of visit.machines) {
    if (!machine || typeof machine !== "object") {
      return null;
    }

    if (
      typeof machine.machineId !== "string" ||
      !machine.machineId.trim() ||
      !Number.isSafeInteger(machine.sequenceNumber) ||
      machine.sequenceNumber <= 0 ||
      typeof machine.drinkCountRequired !== "boolean" ||
      !machine.machineTarget ||
      machine.machineTarget.id !== machine.machineId ||
      typeof machine.machineTarget.qrCode !== "string" ||
      !machine.machineTarget.qrCode.trim()
    ) {
      return null;
    }

    if (
      machineIds.has(machine.machineId) ||
      sequenceNumbers.has(machine.sequenceNumber)
    ) {
      return null;
    }

    const requiredSteps = getRequiredMachineSteps(machine);

    if (!requiredSteps.includes(machine.currentStep)) {
      return null;
    }

    if (!Array.isArray(machine.beforePhotos)) {
      return null;
    }

    if (
      !machine.afterService ||
      typeof machine.afterService !== "object"
    ) {
      return null;
    }

    if (
      machine.completedAt !== null &&
      (
        typeof machine.completedAt !== "string" ||
        !Number.isFinite(Date.parse(machine.completedAt)) ||
        machine.currentStep !== "after_service"
      )
    ) {
      return null;
    }

    if (!machine.drinkCountRequired && machine.drinkCount !== null) {
      return null;
    }

    const currentStepIndex = requiredSteps.indexOf(machine.currentStep);

    const hasReachedStep = (
      step: (typeof requiredSteps)[number],
    ): boolean => {
      const stepIndex = requiredSteps.indexOf(step);

      return (
        stepIndex !== -1 &&
        (currentStepIndex > stepIndex || machine.completedAt !== null)
      );
    };

    if (hasReachedStep("machine_scan")) {
      const scan = machine.machineScanVerification;

      if (
        !scan ||
        scan.machineId !== machine.machineId ||
        scan.expectedQrCode !== machine.machineTarget.qrCode ||
        scan.scannedValue !== machine.machineTarget.qrCode
      ) {
        return null;
      }
    }

    if (hasReachedStep("before_photos")) {
      for (const kind of BEFORE_PHOTO_KINDS) {
        if (
          !machine.beforePhotos.some(
            (photo) =>
              photo.kind === kind &&
              typeof photo.localUri === "string" &&
              photo.localUri.trim().length > 0,
          )
        ) {
          return null;
        }
      }
    }

    if (hasReachedStep("drink_count") && !machine.drinkCount) {
      return null;
    }

    if (hasReachedStep("machine_refill")) {
      const confirmation = machine.machineRefill;

      if (
        !confirmation ||
        confirmation.syncStatus !== "synced" ||
        !confirmation.databaseId ||
        (confirmation.outcome === "unable_to_refill" &&
          !confirmation.reason?.trim())
      ) {
        return null;
      }
    }

    if (
      machine.completedAt !== null &&
      !machine.afterService.afterPhoto?.localUri
    ) {
      return null;
    }

    const refill = machine.machineRefill;

    if (refill !== null) {
      if (
        typeof refill !== "object" ||
        refill.recordType !== "confirmation" ||
        refill.sourceVisitId !== visit.id ||
        !["refilled", "not_needed", "unable_to_refill"].includes(
          refill.outcome,
        ) ||
        typeof refill.confirmedAt !== "string" ||
        !Number.isFinite(Date.parse(refill.confirmedAt)) ||
        !["pending_sync", "synced", "failed"].includes(
          refill.syncStatus,
        ) ||
        (refill.databaseId !== null &&
          (typeof refill.databaseId !== "string" ||
            !refill.databaseId.trim())) ||
        (refill.syncStatus === "synced" && !refill.databaseId)
      ) {
        return null;
      }

      if (
        refill.outcome === "unable_to_refill"
          ? typeof refill.reason !== "string" ||
            !refill.reason.trim()
          : refill.reason !== null
      ) {
        return null;
      }
    }

    const drinkCount = machine.drinkCount;

    if (drinkCount !== null) {
      if (
        !machine.drinkCountRequired ||
        typeof drinkCount !== "object" ||
        typeof drinkCount.databaseId !== "string" ||
        !drinkCount.databaseId.trim() ||
        drinkCount.sourceVisitId !== visit.id ||
        !Number.isSafeInteger(drinkCount.runningTotal) ||
        drinkCount.runningTotal < 0 ||
        !Number.isSafeInteger(drinkCount.archiveTotal) ||
        drinkCount.archiveTotal < 0 ||
        typeof drinkCount.recordedAt !== "string" ||
        !Number.isFinite(Date.parse(drinkCount.recordedAt))
      ) {
        return null;
      }
    }

    machineIds.add(machine.machineId);
    sequenceNumbers.add(machine.sequenceNumber);
  }

  for (let index = 1; index < visit.machines.length; index++) {
    if (
      visit.machines[index - 1].sequenceNumber >=
      visit.machines[index].sequenceNumber
    ) {
      return null;
    }
  }

  if (
    !Number.isSafeInteger(visit.activeMachineIndex) ||
    visit.activeMachineIndex! < 0 ||
    visit.activeMachineIndex! >= visit.machines.length
  ) {
    return null;
  }

  const activeIndex = visit.activeMachineIndex!;

  for (let index = 0; index < visit.machines.length; index++) {
    const machine = visit.machines[index];

    if (index < activeIndex && !machine.completedAt) {
      return null;
    }

    if (
      visit.currentStep === "machine_service" &&
      index >= activeIndex &&
      machine.completedAt
    ) {
      return null;
    }
  }

  const allMachinesCompleted = visit.machines.every(
    (machine) => machine.completedAt !== null,
  );

  const hasReachedPostMachineStage =
    visit.currentStep === "reserve_after" ||
    visit.currentStep === "summary";

  if (hasReachedPostMachineStage && !allMachinesCompleted) {
    return null;
  }

  if (visit.currentStep === "machine_service") {
    const activeMachine = visit.machines[activeIndex];

    if (activeMachine.completedAt !== null) {
      return null;
    }

    const previousMachinesCompleted = visit.machines
      .slice(0, activeIndex)
      .every((machine) => machine.completedAt !== null);

    const remainingMachinesNotCompleted = visit.machines
      .slice(activeIndex + 1)
      .every((machine) => machine.completedAt === null);

    if (
      !previousMachinesCompleted ||
      !remainingMachinesNotCompleted
    ) {
      return null;
    }
  }

  const validSummarySyncStatuses = [
    "not_started",
    "pending_sync",
    "synced",
    "failed",
  ];

  if (
    !visit.summary ||
    !validSummarySyncStatuses.includes(visit.summary.syncStatus) ||
    (visit.summary.databaseId !== null &&
      (typeof visit.summary.databaseId !== "string" ||
        !visit.summary.databaseId.trim())) ||
    (visit.summary.syncError !== null &&
      typeof visit.summary.syncError !== "string")
  ) {
    return null;
  }

  if (visit.status === "completed") {
    if (
      visit.currentStep !== "summary" ||
      !allMachinesCompleted ||
      typeof visit.completedAt !== "string" ||
      !Number.isFinite(Date.parse(visit.completedAt))
    ) {
      return null;
    }

    if (visit.summary.syncStatus === "not_started") {
      return null;
    }
  }

  if (
    visit.summary.syncStatus === "synced" &&
    !visit.summary.databaseId
  ) {
    return null;
  }

  const sharedRecords = [
    visit.inventoryAudit,
    visit.restockDrop,
    visit.reserveAfter,
  ];

  for (const record of sharedRecords) {
    if (!record) {
      continue;
    }

    if (record.sourceVisitId !== visit.id) {
      return null;
    }

    if (
      !["pending_sync", "synced", "failed"].includes(
        record.syncStatus,
      )
    ) {
      return null;
    }

    if (
      record.syncStatus === "synced" &&
      (typeof record.databaseId !== "string" ||
        !record.databaseId.trim())
    ) {
      return null;
    }
  }

  const confirmation = visit.clientConfirmation;

  if (!confirmation || typeof confirmation !== "object") {
    return null;
  }

  const signature = confirmation.signature;

  if (signature) {
    const validUploadStatuses = [
      "pending_upload",
      "uploading",
      "uploaded",
      "failed",
    ];

    if (
      typeof signature.localUri !== "string" ||
      !signature.localUri.trim() ||
      !validUploadStatuses.includes(signature.uploadStatus) ||
      !Number.isFinite(Date.parse(signature.signedAt))
    ) {
      return null;
    }

    if (
      signature.uploadStatus === "uploaded" &&
      (!signature.storagePath ||
        !signature.databaseId ||
        !signature.uploadedAt)
    ) {
      return null;
    }

    if (visit.arrivalVerification) {
      const arrivalTime = Date.parse(
        visit.arrivalVerification.verifiedAt,
      );

      if (
        !Number.isFinite(arrivalTime) ||
        Date.parse(signature.signedAt) < arrivalTime
      ) {
        return null;
      }
    }
  }

  if (confirmation.confirmedAt !== null) {
    if (
      typeof confirmation.confirmedAt !== "string" ||
      !Number.isFinite(Date.parse(confirmation.confirmedAt)) ||
      !signature ||
      signature.uploadStatus !== "uploaded"
    ) {
      return null;
    }
  }

  const target = visit.target;

  if (!target || typeof target !== "object") {
    return null;
  }

  const hasValidLatitude =
    typeof target.latitude === "number" &&
    Number.isFinite(target.latitude) &&
    target.latitude >= -90 &&
    target.latitude <= 90;

  const hasValidLongitude =
    typeof target.longitude === "number" &&
    Number.isFinite(target.longitude) &&
    target.longitude >= -180 &&
    target.longitude <= 180;

  const hasValidRadius =
    typeof target.geofenceRadiusMeters === "number" &&
    Number.isFinite(target.geofenceRadiusMeters) &&
    target.geofenceRadiusMeters > 0;

  if (
    typeof target.clientName !== "string" ||
    !target.clientName.trim() ||
    !hasValidLatitude ||
    !hasValidLongitude ||
    !hasValidRadius
  ) {
    return null;
  }

  return visit as MultiMachineServiceVisit;
}
