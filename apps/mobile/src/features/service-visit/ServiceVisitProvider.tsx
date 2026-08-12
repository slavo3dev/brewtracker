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

import { useAfterServiceStep } from "../../hooks/useAfterServiceStep";
import { useBeforePhotosStep } from "../../hooks/useBeforePhotosStep";
import { useInventoryAuditStep } from "../../hooks/useInventoryAuditStep";
import { useMeterReadingStep } from "../../hooks/useMeterReadingStep";
import { useRestockStep } from "../../hooks/useRestockStep";
import { useVisitMutation } from "../../hooks/useVisitMutation";

import {
  loadServiceVisit,
  removeServiceVisit,
  saveServiceVisit,
} from "./service-visit.storage";

import {
  createInitialStepStates,
  SERVICE_VISIT_STEPS,
  type BeforePhotoKind,
  type CompleteArrivalInput,
  type CompleteInventoryAuditInput,
  type CompleteMachineScanInput,
  type CompleteMeterReadingInput,
  type CompleteRestockDropInput,
  type SaveAfterPhotoInput,
  type SaveBeforePhotoInput,
  type SaveSignatureInput,
  type ServiceVisit,
  type StartServiceVisitInput,
  type UpdateBeforePhotoUploadInput,
  type UpdateMediaUploadInput,
} from "./service-visit.types";

import { transitionToNextStep } from "./state/service-visit.transitions";
import { validateRestoredVisit } from "./state/service-visit.validation";

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

export function ServiceVisitProvider({ children }: PropsWithChildren) {
  const { session, status: authStatus } = useAuth();

  const [activeVisit, setActiveVisit] = useState<ServiceVisit | null>(null);

  const [restoringVisit, setRestoringVisit] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  /*
   * Shared helper passed into hooks which only
   * need to clear an existing provider error.
   */
  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  /*
   * Central serialized mutation queue.
   *
   * Step 7 media operations use this because
   * upload callbacks may finish after another
   * visit mutation has already happened.
   */
  const { commitVisitMutation } = useVisitMutation({
    activeVisit,
    setActiveVisit,
  });

  /*
   * Step 3 - Before photos
   */
  const {
    saveBeforePhoto,
    updateBeforePhotoUpload,
    removeBeforePhoto,
    completeBeforePhotos,
  } = useBeforePhotosStep({
    activeVisit,
    setActiveVisit,
    clearError,
  });

  /*
   * Step 4 - Meter reading
   */
  const { completeMeterReading } = useMeterReadingStep({
    activeVisit,
    setActiveVisit,
    clearError,
  });

  /*
   * Step 5 - Inventory audit
   */
  const { completeInventoryAudit } = useInventoryAuditStep({
    activeVisit,
    setActiveVisit,
    setErrorMessage,
  });

  /*
   * Step 6 - Restock / drop
   */
  const { completeRestockDrop } = useRestockStep({
    activeVisit,
    setActiveVisit,
    setErrorMessage,
  });

  /*
   * Step 7 - After photo + signature
   */
  const {
    saveAfterPhoto,
    updateAfterPhotoUpload,
    saveSignature,
    updateSignatureUpload,
    removeSignature,
    completeAfterService,
  } = useAfterServiceStep({
    commitVisitMutation,
    clearError,
  });

  /*
   * Restore an unfinished service visit for
   * the currently authenticated user.
   */
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

  /*
   * Start a new visit.
   */
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

  /*
   * Step 1 - Arrival / geofence
   *
   * We have not extracted this step yet, so it
   * remains in the provider for now.
   */
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

  /*
   * Step 2 - Machine QR scan
   *
   * Also remains here until you extract the
   * machine-scan hook.
   */
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

  /*
   * Cancel the current visit.
   */
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

  /*
   * Remove finished/cancelled visit state.
   *
   * Never remove a currently in-progress visit.
   */
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

      completeInventoryAudit,

      completeRestockDrop,

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

      saveBeforePhoto,
      updateBeforePhotoUpload,
      removeBeforePhoto,
      completeBeforePhotos,

      completeMeterReading,

      completeInventoryAudit,

      completeRestockDrop,

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
