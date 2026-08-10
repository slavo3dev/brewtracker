import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "../auth/AuthProvider";
import {
  loadServiceVisit,
  removeServiceVisit,
  saveServiceVisit,
} from "./service-visit.storage";
import { saveMachineMeterReading } from "./meter-reading.service";
import {
  loadClientInventoryProducts,
  saveInventoryAudit,
} from "./inventory-audit.service";
import { saveRestockDrop } from "./restock-drop.service";
import { deleteLocalMedia } from "./after-service-media.service";
import {
  BEFORE_PHOTO_KINDS,
  createInitialStepStates,
  getServiceVisitStepIndex,
  SERVICE_VISIT_STEPS,
  type BeforePhotoKind,
  type CompleteArrivalInput,
  type CompleteMachineScanInput,
  type CompleteMeterReadingInput,
  type CompleteInventoryAuditInput,
  type InventoryAuditItemRecord,
  type CompleteRestockDropInput,
  type RestockDropItemRecord,
  type SaveBeforePhotoInput,
  type ServiceVisit,
  type ServiceVisitStepId,
  type StartServiceVisitInput,
  type UpdateBeforePhotoUploadInput,
  type SaveAfterPhotoInput,
  type SaveSignatureInput,
  type UpdateMediaUploadInput,
} from "./service-visit.types";

type ServiceVisitContextValue = {
  activeVisit: ServiceVisit | null;
  restoringVisit: boolean;
  errorMessage: string | null;

  startVisit: (
    input: Omit<StartServiceVisitInput, "userId">,
  ) => Promise<ServiceVisit>;

  completeArrival: (input: CompleteArrivalInput) => Promise<ServiceVisit>;

  completeMachineScan: (
    input: CompleteMachineScanInput,
  ) => Promise<ServiceVisit>;

  saveBeforePhoto: (input: SaveBeforePhotoInput) => Promise<ServiceVisit>;

  updateBeforePhotoUpload: (
    visit: ServiceVisit,
    kind: BeforePhotoKind,
    input: UpdateBeforePhotoUploadInput,
  ) => Promise<ServiceVisit>;

  removeBeforePhoto: (kind: BeforePhotoKind) => Promise<ServiceVisit>;

  completeBeforePhotos: () => Promise<ServiceVisit>;

  completeMeterReading: (
    input: CompleteMeterReadingInput,
  ) => Promise<ServiceVisit>;

  completeInventoryAudit: (
    input: CompleteInventoryAuditInput,
  ) => Promise<ServiceVisit>;

  completeRestockDrop: (
    input: CompleteRestockDropInput,
  ) => Promise<ServiceVisit>;

  saveAfterPhoto: (input: SaveAfterPhotoInput) => Promise<ServiceVisit>;

  updateAfterPhotoUpload: (
    localUri: string,
    input: UpdateMediaUploadInput,
  ) => Promise<ServiceVisit>;

  saveSignature: (input: SaveSignatureInput) => Promise<ServiceVisit>;

  updateSignatureUpload: (
    localUri: string,
    input: UpdateMediaUploadInput,
  ) => Promise<ServiceVisit>;

  removeSignature: () => Promise<ServiceVisit>;

  completeAfterService: () => Promise<ServiceVisit>;

  cancelVisit: () => Promise<void>;
  clearCompletedVisit: () => Promise<void>;

  retryRestore: () => Promise<void>;
  clearLocalVisit: () => Promise<void>;

  isVisitForStop: (stopId: string) => boolean;
};

const ServiceVisitContext = createContext<ServiceVisitContextValue | null>(
  null,
);

function createVisitId(): string {
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function validateRestoredVisit(
  visit: ServiceVisit,
  userId: string,
): ServiceVisit | null {
  if (visit.userId !== userId) {
    return null;
  }

  if (!visit.id || !visit.routeId || !visit.stopId) {
    return null;
  }

  if (!visit.target) {
    return null;
  }

  if (!visit.machineTarget) {
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

  const currentStepExists = SERVICE_VISIT_STEPS.some(
    (step) => step.id === visit.currentStep,
  );

  if (!currentStepExists) {
    return null;
  }

  if (!Array.isArray(visit.steps)) {
    return null;
  }

  if (visit.steps.length !== SERVICE_VISIT_STEPS.length) {
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

function transitionToNextStep(
  visit: ServiceVisit,
  stepId: ServiceVisitStepId,
  timestamp: string,
): ServiceVisit {
  if (visit.status !== "in_progress") {
    throw new Error("Only an in-progress service visit can be updated.");
  }

  if (visit.currentStep !== stepId) {
    throw new Error(
      `Step "${stepId}" cannot be completed yet. The current required step is "${visit.currentStep}".`,
    );
  }

  const currentIndex = getServiceVisitStepIndex(stepId);

  if (currentIndex < 0) {
    throw new Error("The requested service step is invalid.");
  }

  const isFinalStep = currentIndex === SERVICE_VISIT_STEPS.length - 1;

  const updatedSteps = visit.steps.map((step, index) => {
    if (index === currentIndex) {
      return {
        ...step,
        status: "completed" as const,
        completedAt: timestamp,
      };
    }

    if (!isFinalStep && index === currentIndex + 1) {
      return {
        ...step,
        status: "current" as const,
      };
    }

    return step;
  });

  return {
    ...visit,
    status: isFinalStep ? "completed" : "in_progress",
    currentStep: isFinalStep
      ? visit.currentStep
      : SERVICE_VISIT_STEPS[currentIndex + 1].id,
    steps: updatedSteps,
    updatedAt: timestamp,
    completedAt: isFinalStep ? timestamp : null,
  };
}

export function ServiceVisitProvider({ children }: PropsWithChildren) {
  const { session, status: authStatus } = useAuth();

  const [activeVisit, setActiveVisit] = useState<ServiceVisit | null>(null);

  const activeVisitRef = useRef<ServiceVisit | null>(null);

  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [restoringVisit, setRestoringVisit] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    activeVisitRef.current = activeVisit;
  }, [activeVisit]);

  const commitVisitMutation = useCallback(
    (
      mutation: (
        currentVisit: ServiceVisit,
      ) => ServiceVisit | Promise<ServiceVisit>,
    ): Promise<ServiceVisit> => {
      const operation = mutationQueueRef.current.then(async () => {
        const currentVisit = activeVisitRef.current;

        if (!currentVisit) {
          throw new Error("There is no active service visit.");
        }

        const updatedVisit = await mutation(currentVisit);

        await saveServiceVisit(updatedVisit);

        activeVisitRef.current = updatedVisit;
        setActiveVisit(updatedVisit);

        return updatedVisit;
      });

      /*
       * A rejected operation must not leave the
       * queue permanently rejected.
       */
      mutationQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );

      return operation;
    },
    [],
  );

  const restoreVisit = useCallback(async (): Promise<void> => {
    if (authStatus !== "authenticated" || !userId) {
      setActiveVisit(null);
      setRestoringVisit(false);
      setErrorMessage(null);
      return;
    }

    setRestoringVisit(true);
    setErrorMessage(null);

    try {
      const storedVisit = await loadServiceVisit(userId);

      if (!storedVisit) {
        setActiveVisit(null);
        return;
      }

      const validVisit = validateRestoredVisit(storedVisit, userId);

      if (!validVisit) {
        throw new Error(
          "The saved service visit is invalid or uses an unsupported local format.",
        );
      }

      setActiveVisit(validVisit);
    } catch (error) {
      setActiveVisit(null);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to restore the active service visit.",
      );
    } finally {
      setRestoringVisit(false);
    }
  }, [authStatus, userId]);

  useEffect(() => {
    void restoreVisit();
  }, [restoreVisit]);

  const retryRestore = useCallback(async (): Promise<void> => {
    await restoreVisit();
  }, [restoreVisit]);

  const clearLocalVisit = useCallback(async (): Promise<void> => {
    if (!userId) {
      setActiveVisit(null);
      setErrorMessage(null);
      setRestoringVisit(false);
      return;
    }

    setRestoringVisit(true);

    try {
      await removeServiceVisit(userId);

      setActiveVisit(null);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to discard the saved service visit.",
      );
    } finally {
      setRestoringVisit(false);
    }
  }, [userId]);

  const startVisit = useCallback(
    async (
      input: Omit<StartServiceVisitInput, "userId">,
    ): Promise<ServiceVisit> => {
      if (!userId) {
        throw new Error("You must be signed in to start a service visit.");
      }

      if (activeVisit?.status === "in_progress") {
        if (activeVisit.stopId === input.stopId) {
          return activeVisit;
        }

        throw new Error(
          "Complete or cancel the active service visit before starting another stop.",
        );
      }

      if (input.target.latitude == null || input.target.longitude == null) {
        throw new Error(
          "This client has no valid geofence coordinates. Ask a manager to update the client location.",
        );
      }

      if (input.target.geofenceRadiusMeters <= 0) {
        throw new Error("This client has an invalid geofence radius.");
      }

      if (!input.machineId) {
        throw new Error("A machine must be assigned before starting service.");
      }

      if (
        input.machineTarget.id !== input.machineId ||
        !input.machineTarget.qrCode.trim()
      ) {
        throw new Error(
          "The assigned machine has invalid QR verification data.",
        );
      }

      const now = new Date().toISOString();

      const visit: ServiceVisit = {
        id: createVisitId(),
        userId,
        routeId: input.routeId,
        stopId: input.stopId,
        clientId: input.clientId,
        machineId: input.machineId,

        target: {
          ...input.target,
          signatureRequired: input.target.signatureRequired ?? true,
        },
        machineTarget: {
          ...input.machineTarget,
          qrCode: input.machineTarget.qrCode.trim(),
        },

        status: "in_progress",
        currentStep: SERVICE_VISIT_STEPS[0].id,

        steps: createInitialStepStates(),

        arrivalVerification: null,
        machineScanVerification: null,
        beforePhotos: [],
        meterReading: null,
        inventoryAudit: null,
        restockDrop: null,
        afterService: {
          afterPhoto: null,
          signature: null,
          signatureRequired: input.target.signatureRequired ?? true,
          signatureBypassedAt: null,
        },

        startedAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
      };

      await saveServiceVisit(visit);

      setActiveVisit(visit);
      setErrorMessage(null);

      return visit;
    },
    [activeVisit, userId],
  );

  const completeArrival = useCallback(
    async (input: CompleteArrivalInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "arrival") {
        throw new Error(
          "Arrival verification can only be completed during Step 1.",
        );
      }

      const expectedRadius = activeVisit.target.geofenceRadiusMeters;

      if (expectedRadius <= 0) {
        throw new Error("The client geofence radius is invalid.");
      }

      if (input.method === "geofence") {
        if (!input.driverPosition || !input.targetPosition) {
          throw new Error(
            "A valid GPS position is required to confirm arrival.",
          );
        }

        if (input.distanceMeters == null) {
          throw new Error(
            "The distance from the client could not be calculated.",
          );
        }

        if (input.distanceMeters > expectedRadius) {
          throw new Error("You are outside the client geofence.");
        }
      }

      const normalizedOverrideReason = input.overrideReason?.trim() ?? "";

      if (
        input.method === "manual_override" &&
        normalizedOverrideReason.length < 10
      ) {
        throw new Error(
          "Enter a clear override reason of at least 10 characters.",
        );
      }

      const now = new Date().toISOString();

      const visitWithArrival: ServiceVisit = {
        ...activeVisit,
        arrivalVerification: {
          method: input.method,
          driverPosition: input.driverPosition,
          targetPosition: input.targetPosition,
          distanceMeters: input.distanceMeters,
          geofenceRadiusMeters: expectedRadius,
          overrideReason:
            input.method === "manual_override"
              ? normalizedOverrideReason
              : null,
          verifiedAt: now,
        },
      };

      const updatedVisit = transitionToNextStep(
        visitWithArrival,
        "arrival",
        now,
      );

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      setErrorMessage(null);

      return updatedVisit;
    },
    [activeVisit],
  );

  const completeMachineScan = useCallback(
    async (input: CompleteMachineScanInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "machine_scan") {
        throw new Error(
          "Machine scanning can only be completed during Step 2.",
        );
      }

      const scannedValue = input.scannedValue.trim();

      if (!scannedValue) {
        throw new Error("The scanned QR code is empty.");
      }

      const expectedQrCode = activeVisit.machineTarget.qrCode.trim();

      if (!expectedQrCode) {
        throw new Error("The assigned machine has no valid QR code.");
      }

      if (scannedValue !== expectedQrCode) {
        throw new Error(
          "This QR code belongs to a different machine. Scan the machine assigned to this stop.",
        );
      }

      const now = new Date().toISOString();

      const visitWithScan: ServiceVisit = {
        ...activeVisit,
        machineScanVerification: {
          scannedValue,
          expectedQrCode,
          machineId: activeVisit.machineTarget.id,
          verifiedAt: now,
        },
      };

      const updatedVisit = transitionToNextStep(
        visitWithScan,
        "machine_scan",
        now,
      );

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      setErrorMessage(null);

      return updatedVisit;
    },
    [activeVisit],
  );

  const saveBeforePhoto = useCallback(
    async (input: SaveBeforePhotoInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "before_photos") {
        throw new Error("Before photos can only be captured during Step 3.");
      }

      if (!input.localUri.trim()) {
        throw new Error("The locally stored photo URI is missing.");
      }

      const updatedPhotos = activeVisit.beforePhotos.filter(
        (photo) => photo.kind !== input.kind,
      );

      updatedPhotos.push({
        kind: input.kind,
        localUri: input.localUri,
        storagePath: null,
        databaseId: null,
        uploadStatus: "pending_upload",
        uploadError: null,
        capturedAt: input.capturedAt,
        uploadedAt: null,
      });

      const updatedVisit: ServiceVisit = {
        ...activeVisit,
        beforePhotos: updatedPhotos,
        updatedAt: new Date().toISOString(),
      };

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      setErrorMessage(null);

      return updatedVisit;
    },
    [activeVisit],
  );

  const updateBeforePhotoUpload = useCallback(
    async (
      visit: ServiceVisit,
      kind: BeforePhotoKind,
      input: UpdateBeforePhotoUploadInput,
    ): Promise<ServiceVisit> => {
      const existingPhoto = visit.beforePhotos.find(
        (photo) => photo.kind === kind,
      );

      if (!existingPhoto) {
        throw new Error("The selected before photo could not be found.");
      }

      const updatedPhotos = visit.beforePhotos.map((photo) =>
        photo.kind === kind
          ? {
              ...photo,
              uploadStatus: input.uploadStatus,
              storagePath:
                input.storagePath !== undefined
                  ? input.storagePath
                  : photo.storagePath,
              uploadError:
                input.uploadError !== undefined
                  ? input.uploadError
                  : photo.uploadError,
              uploadedAt:
                input.uploadedAt !== undefined
                  ? input.uploadedAt
                  : photo.uploadedAt,
              databaseId:
                input.databaseId !== undefined
                  ? input.databaseId
                  : photo.databaseId,
            }
          : photo,
      );

      const updatedVisit: ServiceVisit = {
        ...visit,
        beforePhotos: updatedPhotos,
        updatedAt: new Date().toISOString(),
      };

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);

      return updatedVisit;
    },
    [],
  );

  const removeBeforePhoto = useCallback(
    async (kind: BeforePhotoKind): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "before_photos") {
        throw new Error("Before photos can only be changed during Step 3.");
      }

      const updatedVisit: ServiceVisit = {
        ...activeVisit,
        beforePhotos: activeVisit.beforePhotos.filter(
          (photo) => photo.kind !== kind,
        ),
        updatedAt: new Date().toISOString(),
      };

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      setErrorMessage(null);

      return updatedVisit;
    },
    [activeVisit],
  );

  const completeBeforePhotos = useCallback(async (): Promise<ServiceVisit> => {
    if (!activeVisit) {
      throw new Error("There is no active service visit.");
    }

    if (activeVisit.currentStep !== "before_photos") {
      throw new Error(
        "Before-photo verification can only be completed during Step 3.",
      );
    }

    const exteriorPhoto = activeVisit.beforePhotos.find(
      (photo) => photo.kind === "exterior",
    );

    const interiorPhoto = activeVisit.beforePhotos.find(
      (photo) => photo.kind === "interior_hopper",
    );

    if (!exteriorPhoto?.localUri) {
      throw new Error("Capture the required exterior machine photo.");
    }

    if (!interiorPhoto?.localUri) {
      throw new Error("Capture the required interior/hopper photo.");
    }

    const hasUploadingPhoto = activeVisit.beforePhotos.some(
      (photo) => photo.uploadStatus === "uploading",
    );

    if (hasUploadingPhoto) {
      throw new Error("Wait for the current photo upload attempt to finish.");
    }

    const now = new Date().toISOString();

    const updatedVisit = transitionToNextStep(
      activeVisit,
      "before_photos",
      now,
    );

    await saveServiceVisit(updatedVisit);

    setActiveVisit(updatedVisit);
    setErrorMessage(null);

    return updatedVisit;
  }, [activeVisit]);

  const completeMeterReading = useCallback(
    async (input: CompleteMeterReadingInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "meter_reading") {
        throw new Error(
          "The meter reading can only be completed during Step 4.",
        );
      }

      if (!Number.isSafeInteger(input.reading) || input.reading < 0) {
        throw new Error(
          "Enter a valid non-negative whole-number meter reading.",
        );
      }

      const savedReading = await saveMachineMeterReading({
        machineId: activeVisit.machineId,
        stopId: activeVisit.stopId,
        recordedBy: activeVisit.userId,
        sourceVisitId: activeVisit.id,
        reading: input.reading,
      });

      const now = new Date().toISOString();

      const visitWithMeterReading: ServiceVisit = {
        ...activeVisit,
        meterReading: {
          databaseId: savedReading.id,
          sourceVisitId: savedReading.sourceVisitId,
          reading: savedReading.reading,
          previousReading: savedReading.previousReading,
          delta: savedReading.delta,
          recordedAt: savedReading.recordedAt,
        },
        updatedAt: now,
      };

      const updatedVisit = transitionToNextStep(
        visitWithMeterReading,
        "meter_reading",
        now,
      );

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      setErrorMessage(null);

      return updatedVisit;
    },
    [activeVisit],
  );

  const completeInventoryAudit = useCallback(
    async (input: CompleteInventoryAuditInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "inventory_audit") {
        throw new Error(
          "The inventory audit can only be completed during Step 5.",
        );
      }

      if (input.counts.length === 0) {
        throw new Error("At least one inventory count is required.");
      }

      const productIds = new Set<string>();

      for (const count of input.counts) {
        if (!count.productId.trim()) {
          throw new Error("Every inventory count must reference a product.");
        }

        if (productIds.has(count.productId)) {
          throw new Error(
            "A product cannot appear more than once in the audit.",
          );
        }

        if (!Number.isFinite(count.quantity) || count.quantity < 0) {
          throw new Error("Every inventory quantity must be zero or greater.");
        }

        productIds.add(count.productId);
      }

      const configuredProducts = await loadClientInventoryProducts(
        activeVisit.clientId,
      );

      const configuredById = new Map(
        configuredProducts.map((product) => [product.productId, product]),
      );

      if (
        configuredProducts.some(
          (product) => product.isRequired && !productIds.has(product.productId),
        )
      ) {
        throw new Error("Enter a quantity for every required client product.");
      }

      const items: InventoryAuditItemRecord[] = input.counts.map((count) => {
        const product = configuredById.get(count.productId);

        if (!product) {
          throw new Error(
            "The inventory list changed. Reload the step and try again.",
          );
        }

        return {
          productId: product.productId,
          sku: product.sku,
          name: product.name,
          category: product.category,
          unitLabel: product.unitLabel,
          quantity: count.quantity,
        };
      });

      const countedAt = new Date().toISOString();

      /*
       * Persist locally before attempting the network mutation.
       * If the request fails, the audit stays in the visit as
       * pending/failed and can be retried.
       */
      const visitWithPendingAudit: ServiceVisit = {
        ...activeVisit,
        inventoryAudit: {
          databaseId: null,
          sourceVisitId: activeVisit.id,
          countedAt,
          items,
          syncStatus: "pending_sync",
          syncError: null,
        },
        updatedAt: countedAt,
      };

      await saveServiceVisit(visitWithPendingAudit);
      setActiveVisit(visitWithPendingAudit);

      try {
        const databaseId = await saveInventoryAudit({
          sourceVisitId: activeVisit.id,
          clientId: activeVisit.clientId,
          stopId: activeVisit.stopId,
          machineId: activeVisit.machineId,
          countedAt,
          counts: input.counts,
        });

        const syncedAt = new Date().toISOString();

        const visitWithSyncedAudit: ServiceVisit = {
          ...visitWithPendingAudit,
          inventoryAudit: {
            ...visitWithPendingAudit.inventoryAudit!,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: syncedAt,
        };

        const updatedVisit = transitionToNextStep(
          visitWithSyncedAudit,
          "inventory_audit",
          syncedAt,
        );

        await saveServiceVisit(updatedVisit);

        setActiveVisit(updatedVisit);
        setErrorMessage(null);

        return updatedVisit;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sync the inventory audit.";

        const failedVisit: ServiceVisit = {
          ...visitWithPendingAudit,
          inventoryAudit: {
            ...visitWithPendingAudit.inventoryAudit!,
            syncStatus: "failed",
            syncError: message,
          },
          updatedAt: new Date().toISOString(),
        };

        await saveServiceVisit(failedVisit);
        setActiveVisit(failedVisit);
        setErrorMessage(message);

        throw new Error(message);
      }
    },
    [activeVisit],
  );

  const completeRestockDrop = useCallback(
    async (input: CompleteRestockDropInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "restock") {
        throw new Error("Restock can only be completed during Step 6.");
      }

      const inventoryAudit = activeVisit.inventoryAudit;

      if (
        !inventoryAudit ||
        inventoryAudit.syncStatus !== "synced" ||
        !inventoryAudit.databaseId
      ) {
        throw new Error(
          "The inventory audit must be synced before restocking.",
        );
      }

      if (input.quantities.length === 0) {
        throw new Error("At least one restock quantity is required.");
      }

      const productIds = new Set<string>();

      for (const quantity of input.quantities) {
        if (!quantity.productId.trim()) {
          throw new Error("Every restock quantity must reference a product.");
        }

        if (productIds.has(quantity.productId)) {
          throw new Error("A product cannot appear more than once.");
        }

        if (
          !Number.isFinite(quantity.actualQuantity) ||
          quantity.actualQuantity < 0
        ) {
          throw new Error(
            "Every actual restock quantity must be zero or greater.",
          );
        }

        productIds.add(quantity.productId);
      }

      const configuredProducts = await loadClientInventoryProducts(
        activeVisit.clientId,
      );

      const configuredById = new Map(
        configuredProducts.map((product) => [product.productId, product]),
      );

      const auditByProductId = new Map(
        inventoryAudit.items.map((item) => [item.productId, item]),
      );

      const missingParProduct = configuredProducts.find(
        (product) =>
          auditByProductId.has(product.productId) && product.parLevel === null,
      );

      if (missingParProduct) {
        throw new Error(
          `${missingParProduct.name} does not have a configured par level.`,
        );
      }

      const expectedProductIds = inventoryAudit.items.map(
        (item) => item.productId,
      );

      if (expectedProductIds.some((productId) => !productIds.has(productId))) {
        throw new Error(
          "Confirm the actual quantity for every audited product.",
        );
      }

      const items: RestockDropItemRecord[] = input.quantities.map(
        (quantity) => {
          const auditItem = auditByProductId.get(quantity.productId);

          const configuredProduct = configuredById.get(quantity.productId);

          if (
            !auditItem ||
            !configuredProduct ||
            configuredProduct.parLevel === null
          ) {
            throw new Error(
              "The inventory configuration changed. Reload the step and try again.",
            );
          }

          const recommendedQuantity = Math.max(
            configuredProduct.parLevel - auditItem.quantity,
            0,
          );

          return {
            productId: auditItem.productId,
            sku: auditItem.sku,
            name: auditItem.name,
            category: auditItem.category,
            unitLabel: auditItem.unitLabel,
            countedQuantity: auditItem.quantity,
            parLevel: configuredProduct.parLevel,
            recommendedQuantity,
            actualQuantity: quantity.actualQuantity,
          };
        },
      );

      const confirmedAt = new Date().toISOString();

      const visitWithPendingRestock: ServiceVisit = {
        ...activeVisit,
        restockDrop: {
          databaseId: null,
          sourceVisitId: activeVisit.id,
          inventoryAuditId: inventoryAudit.databaseId,
          confirmedAt,
          items,
          syncStatus: "pending_sync",
          syncError: null,
        },
        updatedAt: confirmedAt,
      };

      await saveServiceVisit(visitWithPendingRestock);
      setActiveVisit(visitWithPendingRestock);

      try {
        const databaseId = await saveRestockDrop({
          sourceVisitId: activeVisit.id,
          inventoryAuditId: inventoryAudit.databaseId,
          clientId: activeVisit.clientId,
          stopId: activeVisit.stopId,
          machineId: activeVisit.machineId,
          confirmedAt,
          quantities: input.quantities,
        });

        const syncedAt = new Date().toISOString();

        const visitWithSyncedRestock: ServiceVisit = {
          ...visitWithPendingRestock,
          restockDrop: {
            ...visitWithPendingRestock.restockDrop!,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: syncedAt,
        };

        const updatedVisit = transitionToNextStep(
          visitWithSyncedRestock,
          "restock",
          syncedAt,
        );

        await saveServiceVisit(updatedVisit);

        setActiveVisit(updatedVisit);
        setErrorMessage(null);

        return updatedVisit;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sync the restock drop.";

        const failedVisit: ServiceVisit = {
          ...visitWithPendingRestock,
          restockDrop: {
            ...visitWithPendingRestock.restockDrop!,
            syncStatus: "failed",
            syncError: message,
          },
          updatedAt: new Date().toISOString(),
        };

        await saveServiceVisit(failedVisit);

        setActiveVisit(failedVisit);
        setErrorMessage(message);

        throw new Error(message);
      }
    },
    [activeVisit],
  );

  const saveAfterPhoto = useCallback(
    async (input: SaveAfterPhotoInput): Promise<ServiceVisit> => {
      if (!input.localUri.trim()) {
        throw new Error(
          "The locally stored after-service " + "photo is missing.",
        );
      }

      let previousLocalUri: string | null = null;

      const updatedVisit = await commitVisitMutation((currentVisit) => {
        if (currentVisit.currentStep !== "after_service") {
          throw new Error(
            "After-service photos can only " + "be captured during Step 7.",
          );
        }

        previousLocalUri =
          currentVisit.afterService.afterPhoto?.localUri ?? null;

        return {
          ...currentVisit,
          afterService: {
            ...currentVisit.afterService,
            afterPhoto: {
              localUri: input.localUri,
              storagePath: null,
              databaseId: null,
              uploadStatus: "pending_upload",
              uploadError: null,
              capturedAt: input.capturedAt,
              uploadedAt: null,
            },
          },
          updatedAt: new Date().toISOString(),
        };
      });

      /*
       * Only delete the previous image after
       * the replacement has been persisted.
       */
      if (previousLocalUri && previousLocalUri !== input.localUri) {
        await deleteLocalMedia(previousLocalUri).catch((error: unknown) => {
          console.warn("Unable to remove replaced " + "after photo:", error);
        });
      }

      setErrorMessage(null);

      return updatedVisit;
    },
    [commitVisitMutation],
  );

  const updateAfterPhotoUpload = useCallback(
    (localUri: string, input: UpdateMediaUploadInput): Promise<ServiceVisit> =>
      commitVisitMutation((currentVisit) => {
        const photo = currentVisit.afterService.afterPhoto;

        /*
         * Ignore a late upload result for a
         * photo the driver already replaced.
         */
        if (!photo || photo.localUri !== localUri) {
          throw new Error(
            "This after-service photo was " +
              "replaced before its upload " +
              "finished.",
          );
        }

        return {
          ...currentVisit,
          afterService: {
            ...currentVisit.afterService,
            afterPhoto: {
              ...photo,
              ...input,
            },
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    [commitVisitMutation],
  );

  const saveSignature = useCallback(
    async (input: SaveSignatureInput): Promise<ServiceVisit> => {
      if (!input.localUri.trim()) {
        throw new Error("The locally stored signature " + "is missing.");
      }

      let previousLocalUri: string | null = null;

      const updatedVisit = await commitVisitMutation((currentVisit) => {
        if (currentVisit.currentStep !== "after_service") {
          throw new Error(
            "A signature can only be " + "captured during Step 7.",
          );
        }

        previousLocalUri =
          currentVisit.afterService.signature?.localUri ?? null;

        return {
          ...currentVisit,
          afterService: {
            ...currentVisit.afterService,
            signature: {
              localUri: input.localUri,
              storagePath: null,
              databaseId: null,
              uploadStatus: "pending_upload",
              uploadError: null,
              signedAt: input.signedAt,
              uploadedAt: null,
            },
            signatureBypassedAt: null,
          },
          updatedAt: new Date().toISOString(),
        };
      });

      if (previousLocalUri && previousLocalUri !== input.localUri) {
        await deleteLocalMedia(previousLocalUri).catch((error: unknown) => {
          console.warn("Unable to remove replaced " + "signature:", error);
        });
      }

      setErrorMessage(null);

      return updatedVisit;
    },
    [commitVisitMutation],
  );

  const updateSignatureUpload = useCallback(
    (localUri: string, input: UpdateMediaUploadInput): Promise<ServiceVisit> =>
      commitVisitMutation((currentVisit) => {
        const signature = currentVisit.afterService.signature;

        if (!signature || signature.localUri !== localUri) {
          throw new Error(
            "This signature was replaced " + "before its upload finished.",
          );
        }

        return {
          ...currentVisit,
          afterService: {
            ...currentVisit.afterService,
            signature: {
              ...signature,
              ...input,
            },
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    [commitVisitMutation],
  );

  const removeSignature = useCallback(async (): Promise<ServiceVisit> => {
    let removedLocalUri: string | null = null;

    const updatedVisit = await commitVisitMutation((currentVisit) => {
      if (currentVisit.currentStep !== "after_service") {
        throw new Error("The signature cannot be " + "changed now.");
      }

      removedLocalUri = currentVisit.afterService.signature?.localUri ?? null;

      return {
        ...currentVisit,
        afterService: {
          ...currentVisit.afterService,
          signature: null,
          signatureBypassedAt: null,
        },
        updatedAt: new Date().toISOString(),
      };
    });

    await deleteLocalMedia(removedLocalUri).catch((error: unknown) => {
      console.warn("Unable to remove local signature:", error);
    });

    setErrorMessage(null);

    return updatedVisit;
  }, [commitVisitMutation]);

  const completeAfterService = useCallback(async (): Promise<ServiceVisit> => {
    const updatedVisit = await commitVisitMutation((currentVisit) => {
      if (currentVisit.currentStep !== "after_service") {
        throw new Error("Step 7 is not the current " + "required step.");
      }

      const { afterPhoto, signature, signatureRequired } =
        currentVisit.afterService;

      if (!afterPhoto?.localUri) {
        throw new Error("Capture the required " + "after-service photo.");
      }

      if (signatureRequired && !signature?.localUri) {
        throw new Error("This client requires a " + "signature.");
      }

      const now = new Date().toISOString();

      const visitWithSignatureResult: ServiceVisit = {
        ...currentVisit,
        afterService: {
          ...currentVisit.afterService,
          signatureBypassedAt: signatureRequired || signature ? null : now,
        },
        updatedAt: now,
      };

      /*
       * This advances only to Step 8.
       * It does not complete the visit.
       */
      return transitionToNextStep(
        visitWithSignatureResult,
        "after_service",
        now,
      );
    });

    setErrorMessage(null);

    return updatedVisit;
  }, [commitVisitMutation]);

  const cancelVisit = useCallback(async (): Promise<void> => {
    if (!activeVisit) {
      return;
    }

    const now = new Date().toISOString();

    const cancelledVisit: ServiceVisit = {
      ...activeVisit,
      status: "cancelled",
      updatedAt: now,
      cancelledAt: now,
    };

    await saveServiceVisit(cancelledVisit);

    setActiveVisit(cancelledVisit);
    setErrorMessage(null);
  }, [activeVisit]);

  const clearCompletedVisit = useCallback(async (): Promise<void> => {
    if (!userId) {
      setActiveVisit(null);
      return;
    }

    if (activeVisit && activeVisit.status === "in_progress") {
      throw new Error("An in-progress visit cannot be removed.");
    }

    await removeServiceVisit(userId);
    setActiveVisit(null);
    setErrorMessage(null);
  }, [activeVisit, userId]);

  const isVisitForStop = useCallback(
    (stopId: string): boolean =>
      activeVisit?.status === "in_progress" && activeVisit.stopId === stopId,
    [activeVisit],
  );

  const value = useMemo<ServiceVisitContextValue>(
    () => ({
      activeVisit,
      restoringVisit,
      errorMessage,
      startVisit,
      completeArrival,
      completeMachineScan,
      completeInventoryAudit,
      completeRestockDrop,
      saveBeforePhoto,
      updateBeforePhotoUpload,
      removeBeforePhoto,
      completeBeforePhotos,
      completeMeterReading,
      saveAfterPhoto,
      updateAfterPhotoUpload,
      saveSignature,
      updateSignatureUpload,
      removeSignature,
      completeAfterService,
      cancelVisit,
      clearCompletedVisit,
      retryRestore,
      clearLocalVisit,
      isVisitForStop,
    }),
    [
      activeVisit,
      restoringVisit,
      errorMessage,
      startVisit,
      completeArrival,
      completeMachineScan,
      completeInventoryAudit,
      completeRestockDrop,
      saveBeforePhoto,
      updateBeforePhotoUpload,
      removeBeforePhoto,
      completeBeforePhotos,
      completeMeterReading,
      saveAfterPhoto,
      updateAfterPhotoUpload,
      saveSignature,
      updateSignatureUpload,
      removeSignature,
      completeAfterService,
      cancelVisit,
      clearCompletedVisit,
      retryRestore,
      clearLocalVisit,
      isVisitForStop,
    ],
  );

  return (
    <ServiceVisitContext.Provider value={value}>
      {children}
    </ServiceVisitContext.Provider>
  );
}

export function useServiceVisit(): ServiceVisitContextValue {
  const context = useContext(ServiceVisitContext);

  if (!context) {
    throw new Error(
      "useServiceVisit must be used inside ServiceVisitProvider.",
    );
  }

  return context;
}
