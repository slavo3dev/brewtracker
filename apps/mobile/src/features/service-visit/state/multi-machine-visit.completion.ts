import { BEFORE_PHOTO_KINDS } from "../service-visit.types";

import type { MultiMachineServiceVisit } from "../multi-machine-visit.types";

export function assertMultiMachineVisitReadyForCompletion(
  visit: MultiMachineServiceVisit,
): void {
  if (visit.status !== "in_progress" || visit.currentStep !== "summary") {
    throw new Error("The visit is not ready for completion.");
  }

  if (!visit.arrivalVerification) {
    throw new Error("Arrival verification is missing.");
  }

  if (visit.machines.length < 1) {
    throw new Error("The visit must contain at least one assigned machine.");
  }

  const machineIds = new Set<string>();

  for (const machine of visit.machines) {
    if (machineIds.has(machine.machineId)) {
      throw new Error("Duplicate machine assignment.");
    }

    machineIds.add(machine.machineId);

    if (!machine.completedAt) {
      throw new Error("Every assigned machine must be completed.");
    }

    const scan = machine.machineScanVerification;

    if (
      !scan ||
      scan.machineId !== machine.machineId ||
      scan.expectedQrCode !== machine.machineTarget.qrCode ||
      scan.scannedValue !== machine.machineTarget.qrCode
    ) {
      throw new Error("Machine QR verification is incomplete.");
    }

    for (const kind of BEFORE_PHOTO_KINDS) {
      if (
        !machine.beforePhotos.some(
          (photo) => photo.kind === kind && Boolean(photo.localUri),
        )
      ) {
        throw new Error(`Required ${kind} photo is missing.`);
      }
    }

    if (
      machine.drinkCountRequired &&
      (!machine.drinkCount ||
        machine.drinkCount.machineId !== machine.machineId ||
        machine.drinkCount.sourceVisitId !== visit.id ||
        machine.drinkCount.syncStatus !== "synced" ||
        !machine.drinkCount.databaseId ||
        machine.drinkCount.archiveTotal === null)
    ) {
      throw new Error(
        "Required Drink Count must finish syncing before completion.",
      );
    }

    const confirmation = machine.machineRefill;

    if (
      !confirmation ||
      confirmation.syncStatus !== "synced" ||
      !confirmation.databaseId
    ) {
      throw new Error("Machine service confirmation must finish syncing.");
    }

    if (
      confirmation.outcome === "unable_to_refill" &&
      !confirmation.reason?.trim()
    ) {
      throw new Error("A reason is required for an unsuccessful refill.");
    }

    if (!machine.afterService.afterPhoto?.localUri) {
      throw new Error("After-service photo is missing.");
    }
  }

  if (
    !visit.inventoryAudit ||
    visit.inventoryAudit.syncStatus !== "synced" ||
    !visit.inventoryAudit.databaseId
  ) {
    throw new Error("Client reserve count must finish syncing.");
  }

  if (
    !visit.restockDrop ||
    visit.restockDrop.syncStatus !== "synced" ||
    !visit.restockDrop.databaseId
  ) {
    throw new Error("Client delivery must finish syncing.");
  }

  if (
    !visit.reserveAfter ||
    visit.reserveAfter.syncStatus !== "synced" ||
    !visit.reserveAfter.databaseId
  ) {
    throw new Error("Client reserve-after calculation must finish syncing.");
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
    throw new Error("Client signature must finish uploading.");
  }

  const arrivalTime = Date.parse(visit.arrivalVerification.verifiedAt);
  const signatureTime = Date.parse(signature.signedAt);

  if (
    !Number.isFinite(arrivalTime) ||
    !Number.isFinite(signatureTime) ||
    signatureTime < arrivalTime
  ) {
    throw new Error("Client confirmation timestamp is invalid.");
  }
}

export function completeMultiMachineVisit(
  visit: MultiMachineServiceVisit,
  now: string = new Date().toISOString(),
): MultiMachineServiceVisit {
  assertMultiMachineVisitReadyForCompletion(visit);

  const completionTime = Date.parse(now);

  if (!Number.isFinite(completionTime)) {
    throw new Error("Invalid completion timestamp.");
  }

  const signatureTime = Date.parse(
    visit.clientConfirmation.signature!.signedAt,
  );

  if (completionTime < signatureTime) {
    throw new Error("Completion cannot precede client confirmation.");
  }

  for (const machine of visit.machines) {
    const machineCompletionTime = Date.parse(machine.completedAt!);

    if (
      !Number.isFinite(machineCompletionTime) ||
      completionTime < machineCompletionTime
    ) {
      throw new Error(
        "Visit completion cannot precede machine service completion.",
      );
    }
  }

  return {
    ...visit,
    status: "completed",
    completedAt: now,
    updatedAt: now,
    summary: {
      ...visit.summary,
      syncStatus: "pending_sync",
      syncError: null,
    },
  };
}
