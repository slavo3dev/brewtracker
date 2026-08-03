import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  BEFORE_PHOTO_KINDS,
  createInitialStepStates,
  getServiceVisitStepIndex,
  SERVICE_VISIT_STEPS,
  type BeforePhotoKind,
  type CompleteArrivalInput,
  type CompleteMachineScanInput,
  type CompleteMeterReadingInput,
  type SaveBeforePhotoInput,
  type ServiceVisit,
  type ServiceVisitStepId,
  type StartServiceVisitInput,
  type UpdateBeforePhotoUploadInput,
} from "./service-visit.types";

type PlaceholderStepId = Exclude<
  ServiceVisitStepId,
  "arrival" | "machine_scan" | "before_photos" | "meter_reading"
>;

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

  completeCurrentStep: (stepId: PlaceholderStepId) => Promise<ServiceVisit>;

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

  return {
    ...visit,
    beforePhotos: restoredBeforePhotos,
    meterReading: restoredMeterReading,
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

  const [restoringVisit, setRestoringVisit] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

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

        target: input.target,
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

  const completeCurrentStep = useCallback(
    async (stepId: PlaceholderStepId): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      const now = new Date().toISOString();

      const updatedVisit = transitionToNextStep(activeVisit, stepId, now);

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      setErrorMessage(null);

      return updatedVisit;
    },
    [activeVisit],
  );

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
      saveBeforePhoto,
      updateBeforePhotoUpload,
      removeBeforePhoto,
      completeBeforePhotos,
      completeMeterReading,
      completeCurrentStep,
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
      saveBeforePhoto,
      updateBeforePhotoUpload,
      removeBeforePhoto,
      completeBeforePhotos,
      completeMeterReading,
      completeCurrentStep,
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
