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
import type {
  MultiMachineServiceVisit,
  StartUnifiedServiceVisitInput,
} from "./multi-machine-visit.types";
import { createMultiMachineVisit } from "./state/multi-machine-visit.factory";
import { advanceMultiMachineVisitStep } from "./state/multi-machine-visit.workflow";
import { advanceActiveMachine } from "./state/multi-machine-visit.transitions";
import {
  loadMultiMachineServiceVisit,
  saveMultiMachineServiceVisit,
  removeMultiMachineServiceVisit,
  recoverInterruptedPhotoUploads,
} from "./multi-machine-visit.storage";

import { useAfterServiceStep } from "../../hooks/useAfterServiceStep";
import { useBeforePhotosStep } from "../../hooks/useBeforePhotosStep";
import { useUnifiedBeforePhotosStep } from "../../hooks/useUnifiedBeforePhotosStep";
import { useUnifiedInventoryAuditStep } from "../../hooks/useUnifiedInventoryAuditStep";
import { useUnifiedDrinkCountStep } from "../../hooks/useUnifiedDrinkCountStep";
import { useUnifiedRestockStep } from "../../hooks/useUnifiedRestockStep";
import { useInventoryAuditStep } from "../../hooks/useInventoryAuditStep";
import { useDrinkCountStep } from "../../hooks/useDrinkCountStep";
import { useRestockStep } from "../../hooks/useRestockStep";
import { useVisitMutation } from "../../hooks/useVisitMutation";
import { useSummaryStep } from "../../hooks/useSummaryStep";
import { useMachineRefillStep } from "../../hooks/useMachineRefillStep";
import { useClientConfirmation } from "../../hooks/useClientConfirmation";
import { useUnifiedSummaryStep } from "../../hooks/useUnifiedSummaryStep";
import { useUnifiedMachineRefillStep } from "../../hooks/useUnifiedMachineRefillStep";
import { useUnifiedAfterServiceStep } from "../../hooks/useUnifiedAfterServiceStep";
import { hasUnsyncedMachinePhotos } from "./state/multi-machine-photo-sync";
import {
  loadServiceVisit,
  removeServiceVisit,
  saveServiceVisit,
} from "./service-visit.storage";
import { markServiceStopArrived } from "./service-visit-stop.service";
import { assertStopCanStartService } from "../routes/route.service";
import {
  claimBeforePhotoUpload,
  claimAfterPhotoUpload,
} from "./state/multi-machine-photo-claim";
import {
  createInitialStepStates,
  type BeforePhotoKind,
  type CompleteArrivalInput,
  type CompleteDrinkCountInput,
  type CompleteInventoryAuditInput,
  type CompleteMachineScanInput,
  type CompleteRestockDropInput,
  type CompleteMachineRefillInput,
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
  unifiedVisit: MultiMachineServiceVisit | null;
  unifiedBeforePhotos: ReturnType<typeof useUnifiedBeforePhotosStep>;
  claimUnifiedBeforePhotoUpload: (
    machineId: string,
    kind: BeforePhotoKind,
    localUri: string,
  ) => Promise<MultiMachineServiceVisit>;
  claimUnifiedAfterPhotoUpload: (
    machineId: string,
    localUri: string,
  ) => Promise<MultiMachineServiceVisit>;
  unifiedInventoryAudit: ReturnType<typeof useUnifiedInventoryAuditStep>;
  unifiedDrinkCount: ReturnType<typeof useUnifiedDrinkCountStep>;
  unifiedMachineRefill: ReturnType<typeof useUnifiedMachineRefillStep>;
  unifiedRestock: ReturnType<typeof useUnifiedRestockStep>;
  unifiedAfterService: ReturnType<typeof useUnifiedAfterServiceStep>;
  completeUnifiedSummary: () => Promise<MultiMachineServiceVisit>;
  retryUnifiedSummarySync: () => Promise<MultiMachineServiceVisit>;
  advanceUnifiedVisit: () => Promise<MultiMachineServiceVisit>;
  completeUnifiedArrival: (
    input: CompleteArrivalInput,
  ) => Promise<MultiMachineServiceVisit>;
  retryUnifiedArrivalSync: () => Promise<MultiMachineServiceVisit>;
  completeUnifiedMachineScan: (
    input: CompleteMachineScanInput,
  ) => Promise<MultiMachineServiceVisit>;
  restoringVisit: boolean;
  errorMessage: string | null;
  restoreErrorMessage: string | null;

  startVisit: (
    input: Omit<StartServiceVisitInput, "userId">,
  ) => Promise<ServiceVisit>;

  startUnifiedVisit: (
    input: StartUnifiedServiceVisitInput,
  ) => Promise<MultiMachineServiceVisit>;

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

  completeDrinkCount: (input: CompleteDrinkCountInput) => Promise<ServiceVisit>;

  completeInventoryAudit: (
    input: CompleteInventoryAuditInput,
  ) => Promise<ServiceVisit>;

  retryInventoryAuditSync: () => Promise<ServiceVisit>;

  completeRestockDrop: (
    input: CompleteRestockDropInput,
  ) => Promise<ServiceVisit>;

  completeMachineRefill: (
    input: CompleteMachineRefillInput,
  ) => Promise<ServiceVisit>;

  retryLegacyMachineRefill: () => Promise<ServiceVisit>;

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

  unifiedClientConfirmation: ReturnType<
    typeof useClientConfirmation<MultiMachineServiceVisit>
  >;

  completeAfterService: () => Promise<ServiceVisit>;

  cancelVisit: () => Promise<void>;

  clearCompletedVisit: () => Promise<void>;

  clearCompletedUnifiedVisit: () => Promise<void>;

  retryRestore: () => Promise<void>;

  clearLocalVisit: () => Promise<void>;

  isVisitForStop: (stopId: string) => boolean;

  completeSummary: () => Promise<ServiceVisit>;

  retrySummarySync: () => Promise<ServiceVisit>;
};

const ServiceVisitContext = createContext<ServiceVisitContextValue | null>(
  null,
);

function createVisitId(): string {
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ServiceVisitProvider({ children }: PropsWithChildren) {
  const {
    session,
    status: authStatus,
    authGeneration,
    getAuthGeneration,
  } = useAuth();

  const [activeVisit, setActiveVisit] = useState<ServiceVisit | null>(null);

  const [unifiedVisit, setUnifiedVisit] =
    useState<MultiMachineServiceVisit | null>(null);

  const unifiedVisitRef = useRef<MultiMachineServiceVisit | null>(null);

  const restoreRequestRef = useRef(0);

  const restoreInProgressRef = useRef(false);
  const pendingRestoreCountRef = useRef(0);

  const unifiedStartInProgressRef = useRef(false);

  const [restoringVisit, setRestoringVisit] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string | null>(
    null,
  );

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
  const { commitVisitMutation, runVisitLifecycle } = useVisitMutation({
    activeVisit,
    setActiveVisit,
    persistVisit: saveServiceVisit,
    getVisitId: (visit) => visit.id,
    getVisitUserId: (visit) => visit.userId,
    authenticatedUserId: authStatus === "authenticated" ? userId : null,
    authGeneration,
    getAuthGeneration,
  });

  const {
    commitVisitMutation: commitUnifiedVisitMutation,
    runVisitLifecycle: runUnifiedVisitLifecycle,
  } = useVisitMutation({
    activeVisit: unifiedVisit,
    setActiveVisit: setUnifiedVisit,
    persistVisit: saveMultiMachineServiceVisit,
    getVisitId: (visit) => visit.id,
    getVisitUserId: (visit) => visit.userId,
    authenticatedUserId: authStatus === "authenticated" ? userId : null,
    authGeneration,
    getAuthGeneration,
  });

  const claimUnifiedBeforePhotoUpload = useCallback(
    (
      machineId: string,
      kind: BeforePhotoKind,
      localUri: string,
    ): Promise<MultiMachineServiceVisit> =>
      commitUnifiedVisitMutation((visit) =>
        claimBeforePhotoUpload(visit, machineId, kind, localUri),
      ),
    [commitUnifiedVisitMutation],
  );

  const claimUnifiedAfterPhotoUpload = useCallback(
    (machineId: string, localUri: string): Promise<MultiMachineServiceVisit> =>
      commitUnifiedVisitMutation((visit) =>
        claimAfterPhotoUpload(visit, machineId, localUri),
      ),
    [commitUnifiedVisitMutation],
  );

  useEffect(() => {
    unifiedVisitRef.current = unifiedVisit;
  }, [unifiedVisit]);

  const advanceUnifiedVisit = useCallback(
    (): Promise<MultiMachineServiceVisit> =>
      commitUnifiedVisitMutation((visit) =>
        visit.currentStep === "machine_service"
          ? advanceActiveMachine(visit)
          : advanceMultiMachineVisitStep(visit),
      ),
    [commitUnifiedVisitMutation],
  );

  const completeUnifiedArrival = useCallback(
    async (input: CompleteArrivalInput): Promise<MultiMachineServiceVisit> => {
      const savedVisit = await commitUnifiedVisitMutation((visit) => {
        if (visit.status !== "in_progress" || visit.currentStep !== "arrival") {
          throw new Error("Arrival is not the current visit step.");
        }

        if (visit.arrivalVerification) {
          throw new Error(
            "Arrival is already verified. Retry synchronization instead.",
          );
        }

        const expectedRadius = visit.target.geofenceRadiusMeters;

        if (!Number.isFinite(expectedRadius) || expectedRadius <= 0) {
          throw new Error("The client geofence radius is invalid.");
        }

        if (input.method === "geofence") {
          if (!input.driverPosition || !input.targetPosition) {
            throw new Error(
              "A valid GPS position is required to confirm arrival.",
            );
          }

          if (
            input.distanceMeters == null ||
            !Number.isFinite(input.distanceMeters) ||
            input.distanceMeters < 0
          ) {
            throw new Error(
              "The distance from the client could not be calculated.",
            );
          }

          if (input.distanceMeters > expectedRadius) {
            throw new Error("You are outside the client geofence.");
          }
        } else if (input.method !== "manual_override") {
          throw new Error("Invalid arrival verification method.");
        }

        const overrideReason = input.overrideReason?.trim() ?? "";

        if (input.method === "manual_override" && overrideReason.length < 10) {
          throw new Error(
            "Enter a clear override reason of at least 10 characters.",
          );
        }

        const now = new Date().toISOString();

        return {
          ...visit,
          arrivalVerification: {
            method: input.method,
            driverPosition: input.driverPosition,
            targetPosition: input.targetPosition,
            distanceMeters: input.distanceMeters,
            geofenceRadiusMeters: expectedRadius,
            overrideReason:
              input.method === "manual_override" ? overrideReason : null,
            verifiedAt: now,
          },
          arrivalSyncStatus: "pending_sync" as const,
          updatedAt: now,
        };
      });

      try {
        await markServiceStopArrived(
          savedVisit.stopId,
          savedVisit.arrivalVerification!.verifiedAt,
        );
      } catch (error) {
        console.warn("Unified arrival sync pending:", error);
        return savedVisit;
      }

      return commitUnifiedVisitMutation((visit) => {
        if (
          visit.id !== savedVisit.id ||
          visit.currentStep !== "arrival" ||
          visit.arrivalVerification?.verifiedAt !==
            savedVisit.arrivalVerification?.verifiedAt
        ) {
          throw new Error("Arrival changed during synchronization.");
        }

        return advanceMultiMachineVisitStep({
          ...visit,
          arrivalSyncStatus: "synced",
        });
      });
    },
    [commitUnifiedVisitMutation],
  );

  const retryUnifiedArrivalSync =
    useCallback(async (): Promise<MultiMachineServiceVisit> => {
      const savedVisit = await commitUnifiedVisitMutation((visit) => {
        if (
          visit.status !== "in_progress" ||
          visit.currentStep !== "arrival" ||
          !visit.arrivalVerification
        ) {
          throw new Error(
            "There is no verified arrival awaiting synchronization.",
          );
        }

        return visit;
      });

      if (savedVisit.arrivalSyncStatus !== "synced") {
        await markServiceStopArrived(
          savedVisit.stopId,
          savedVisit.arrivalVerification!.verifiedAt,
        );
      }

      return commitUnifiedVisitMutation((visit) => {
        if (
          visit.id !== savedVisit.id ||
          visit.currentStep !== "arrival" ||
          visit.arrivalVerification?.verifiedAt !==
            savedVisit.arrivalVerification?.verifiedAt
        ) {
          throw new Error("Arrival changed during synchronization.");
        }

        return advanceMultiMachineVisitStep({
          ...visit,
          arrivalSyncStatus: "synced",
        });
      });
    }, [commitUnifiedVisitMutation]);

  const completeUnifiedMachineScan = useCallback(
    (input: CompleteMachineScanInput): Promise<MultiMachineServiceVisit> =>
      commitUnifiedVisitMutation((visit) => {
        if (
          visit.status !== "in_progress" ||
          visit.currentStep !== "machine_service"
        ) {
          throw new Error("The visit is not servicing a machine.");
        }

        const index = visit.activeMachineIndex;
        const machine = visit.machines[index];

        if (!machine || machine.currentStep !== "machine_scan") {
          throw new Error("Machine scanning is not the current step.");
        }

        const scannedValue = input.scannedValue.trim();
        const expectedQrCode = machine.machineTarget.qrCode.trim();

        if (!scannedValue || !expectedQrCode) {
          throw new Error("A valid machine QR code is required.");
        }

        if (scannedValue !== expectedQrCode) {
          throw new Error("This QR code belongs to a different machine.");
        }

        const now = new Date().toISOString();

        const machines = visit.machines.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                machineScanVerification: {
                  scannedValue,
                  expectedQrCode,
                  machineId: item.machineId,
                  verifiedAt: now,
                },
              }
            : item,
        );

        return advanceActiveMachine(
          {
            ...visit,
            machines,
            updatedAt: now,
          },
          now,
        );
      }),
    [commitUnifiedVisitMutation],
  );

  const unifiedBeforePhotos = useUnifiedBeforePhotosStep({
    commitVisitMutation: commitUnifiedVisitMutation,
    clearError,
  });

  const unifiedInventoryAudit = useUnifiedInventoryAuditStep({
    commitVisitMutation: commitUnifiedVisitMutation,
    clearError,
  });

  const unifiedDrinkCount = useUnifiedDrinkCountStep({
    commitVisitMutation: commitUnifiedVisitMutation,
    clearError,
  });

  const unifiedMachineRefill = useUnifiedMachineRefillStep({
    commitVisitMutation: commitUnifiedVisitMutation,
    clearError,
  });

  const unifiedAfterService = useUnifiedAfterServiceStep({
    commitVisitMutation: commitUnifiedVisitMutation,
    clearError,
  });

  const unifiedRestock = useUnifiedRestockStep({
    commitVisitMutation: commitUnifiedVisitMutation,
    clearError,
  });

  const { completeUnifiedSummary, retryUnifiedSummarySync } =
    useUnifiedSummaryStep({
      commitVisitMutation: commitUnifiedVisitMutation,
      setErrorMessage,
    });

  const { saveSignature, updateSignatureUpload, removeSignature } =
    useClientConfirmation({
      commitVisitMutation,
      setErrorMessage,
    });

  const { completeSummary, retrySummarySync } = useSummaryStep({
    commitVisitMutation,
    setErrorMessage,
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
   * Drink Count
   *
   * This step exists only when the admin assigned
   * the task to the route stop.
   */
  const { completeDrinkCount } = useDrinkCountStep({
    activeVisit,
    setActiveVisit,
    clearError,
  });

  /*
   * Step 5 - Inventory audit
   */
  const { completeInventoryAudit, retryInventoryAuditSync } =
    useInventoryAuditStep({
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

  const { completeMachineRefill, retryLegacyMachineRefill } =
    useMachineRefillStep({
      activeVisit,
      setActiveVisit,
      setErrorMessage,
    });

  /*
   * Step 7 - After photo + signature
   */
  const { saveAfterPhoto, updateAfterPhotoUpload, completeAfterService } =
    useAfterServiceStep({
      commitVisitMutation,
      clearError,
    });

  const unifiedClientConfirmation = useClientConfirmation({
    commitVisitMutation: commitUnifiedVisitMutation,
    setErrorMessage,
  });

  /*
   * Restore an unfinished service visit for
   * the currently authenticated user.
   */
  const restoreVisit = useCallback(async (): Promise<void> => {
    if (unifiedStartInProgressRef.current) {
      throw new Error(
        "Wait for the service visit to finish starting before restoring.",
      );
    }

    if (unifiedVisitRef.current?.status === "in_progress") {
      throw new Error(
        "An active service visit is already loaded. " +
          "Finish the visit before restoring another.",
      );
    }

    if (authStatus !== "authenticated" || !userId) {
      restoreRequestRef.current += 1;
      setActiveVisit(null);
      setUnifiedVisit(null);
      setRestoringVisit(false);
      setRestoreErrorMessage(null);
      return;
    }

    const requestId = ++restoreRequestRef.current;
    const generation = getAuthGeneration();

    pendingRestoreCountRef.current += 1;
    restoreInProgressRef.current = true;

    const isCurrentRequest = () =>
      restoreRequestRef.current === requestId &&
      getAuthGeneration() === generation;

    setRestoringVisit(true);
    setRestoreErrorMessage(null);

    try {
      let restoredLegacyVisit: ServiceVisit | null = null;

      await runUnifiedVisitLifecycle(async (currentVisit) => {
        if (!isCurrentRequest()) {
          throw new Error("The restoration request is no longer current.");
        }

        if (currentVisit !== null) {
          throw new Error(
            "A unified service visit is already loaded. " +
              "Restoration cannot replace the active visit.",
          );
        }

        const loadedUnifiedVisit = await loadMultiMachineServiceVisit(userId);

        if (!isCurrentRequest()) {
          throw new Error("The restoration request is no longer current.");
        }

        const storedLegacyVisit = await loadServiceVisit(userId);

        if (!isCurrentRequest()) {
          throw new Error("The restoration request is no longer current.");
        }

        const validLegacyVisit = storedLegacyVisit
          ? validateRestoredVisit(storedLegacyVisit, userId)
          : null;

        if (storedLegacyVisit && !validLegacyVisit) {
          throw new Error(
            "The saved service visit is invalid or uses an unsupported local format.",
          );
        }

        const blocksNewVisit = (
          visit: { status: string; summary: { syncStatus: string } } | null,
        ) =>
          visit?.status === "in_progress" ||
          (visit?.status === "completed" &&
            visit.summary.syncStatus !== "synced");

        if (
          blocksNewVisit(loadedUnifiedVisit) &&
          blocksNewVisit(validLegacyVisit)
        ) {
          throw new Error(
            "Both legacy and unified service visits require attention. " +
              "Resolve the saved visits before starting another service.",
          );
        }

        const recoveredVisit = loadedUnifiedVisit
          ? recoverInterruptedPhotoUploads(loadedUnifiedVisit)
          : null;

        if (recoveredVisit && recoveredVisit !== loadedUnifiedVisit) {
          if (!isCurrentRequest()) {
            throw new Error("The restoration request is no longer current.");
          }

          await saveMultiMachineServiceVisit(recoveredVisit);
        }

        if (!isCurrentRequest()) {
          throw new Error("The restoration request is no longer current.");
        }

        restoredLegacyVisit = validLegacyVisit;

        return recoveredVisit;
      });

      if (!isCurrentRequest()) return;

      setActiveVisit(restoredLegacyVisit);
    } catch (error) {
      if (!isCurrentRequest()) return;

      setRestoreErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to restore the active service visit.",
      );
    } finally {
      pendingRestoreCountRef.current = Math.max(
        0,
        pendingRestoreCountRef.current - 1,
      );
      restoreInProgressRef.current = pendingRestoreCountRef.current > 0;

      if (isCurrentRequest()) {
        setRestoringVisit(false);
      }
    }
  }, [authStatus, userId, getAuthGeneration, runUnifiedVisitLifecycle]);

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
      setRestoreErrorMessage(null);
      setRestoringVisit(false);

      return;
    }

    setRestoringVisit(true);

    try {
      await removeServiceVisit(userId);

      setActiveVisit(null);
      setErrorMessage(null);
      setRestoreErrorMessage(null);
    } catch (error) {
      setRestoreErrorMessage(
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
  const startUnifiedVisit = useCallback(
    async (
      input: StartUnifiedServiceVisitInput,
    ): Promise<MultiMachineServiceVisit> => {
      if (restoreInProgressRef.current) {
        throw new Error(
          "Wait for the saved service visit to finish restoring.",
        );
      }

      if (unifiedStartInProgressRef.current) {
        throw new Error("A service visit is already being started.");
      }

      unifiedStartInProgressRef.current = true;

      try {
        if (authStatus !== "authenticated" || !userId) {
          throw new Error("You must be signed in to start a service visit.");
        }

        if (restoringVisit || restoreErrorMessage) {
          throw new Error(
            "Restore the saved service visit before starting another service.",
          );
        }

        if (unifiedVisit?.status === "in_progress") {
          if (unifiedVisit.stopId === input.stopId) {
            return unifiedVisit;
          }

          throw new Error(
            "Complete or cancel the active service visit before starting another stop.",
          );
        }

        if (
          unifiedVisit?.status === "completed" &&
          unifiedVisit.summary.syncStatus !== "synced"
        ) {
          throw new Error(
            "Sync the completed service visit before starting another service.",
          );
        }

        if (
          activeVisit?.status === "in_progress" ||
          (activeVisit?.status === "completed" &&
            activeVisit.summary.syncStatus !== "synced")
        ) {
          throw new Error(
            "Resolve the existing service visit before starting another.",
          );
        }

        const generation = getAuthGeneration();

        await assertStopCanStartService(input.stopId);

        if (getAuthGeneration() !== generation) {
          throw new Error("The authentication session changed.");
        }

        const savedVisit = await loadMultiMachineServiceVisit(userId);

        if (getAuthGeneration() !== generation) {
          throw new Error("The authentication session changed.");
        }

        if (
          savedVisit?.status === "in_progress" ||
          (savedVisit?.status === "completed" &&
            savedVisit.summary.syncStatus !== "synced")
        ) {
          throw new Error(
            "A saved service visit requires attention. Restore or sync it before starting another.",
          );
        }

        const visit = createMultiMachineVisit({
          ...input,
          userId,
        });

        await saveMultiMachineServiceVisit(visit);

        if (getAuthGeneration() !== generation) {
          throw new Error(
            "The authentication session changed while saving the visit.",
          );
        }

        setUnifiedVisit(visit);
        setErrorMessage(null);

        return visit;
      } finally {
        unifiedStartInProgressRef.current = false;
      }
    },
    [
      authStatus,
      userId,
      restoringVisit,
      restoreErrorMessage,
      unifiedVisit,
      activeVisit,
      getAuthGeneration,
    ],
  );

  const startVisit = useCallback(
    async (
      input: Omit<StartServiceVisitInput, "userId">,
    ): Promise<ServiceVisit> => {
      if (!userId) {
        throw new Error("You must be signed in to start a service visit.");
      }

      if (restoringVisit || restoreErrorMessage) {
        throw new Error(
          "Restore the saved service visit before starting service.",
        );
      }

      if (unifiedVisit?.status === "in_progress") {
        throw new Error(
          "Complete or cancel the active unified service visit before starting another stop.",
        );
      }

      if (
        unifiedVisit?.status === "completed" &&
        unifiedVisit.summary.syncStatus !== "synced"
      ) {
        throw new Error(
          "Sync the completed unified service visit before starting another service.",
        );
      }

      if (
        activeVisit?.status === "completed" &&
        activeVisit.summary.syncStatus !== "synced"
      ) {
        throw new Error(
          "Sync the completed service visit before starting another service. Open the saved visit and tap Retry Sync.",
        );
      }

      if (activeVisit?.status === "in_progress") {
        if (activeVisit.stopId === input.stopId) {
          return activeVisit;
        }

        throw new Error(
          "Complete or cancel the active service visit before starting another stop.",
        );
      }

      await assertStopCanStartService(input.stopId);

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

        tasks: input.tasks,

        status: "in_progress",

        currentStep: "arrival",

        steps: createInitialStepStates(input.tasks),

        arrivalVerification: null,
        machineScanVerification: null,

        beforePhotos: [],

        drinkCount: null,

        inventoryAudit: null,
        restockDrop: null,
        machineRefill: null,
        reserveAfter: null,

        afterService: {
          afterPhoto: null,
        },

        clientConfirmation: {
          signature: null,
          confirmedAt: null,
        },

        summary: {
          syncStatus: "not_started",
          syncError: null,

          databaseId: null,
          surveyToken: null,
          emailSentAt: null,
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
    [unifiedVisit, activeVisit, userId, restoringVisit, restoreErrorMessage],
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
          "Arrival verification can only be completed during the Arrival step.",
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

      /*
       * Persist the authoritative start of time spent
       * servicing this client.
       *
       * Visit duration is derived later as:
       * stops.completed_at - stops.arrived_at
       */
      await markServiceStopArrived(activeVisit.stopId, now);

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
          "Machine scanning can only be completed during the Machine Scan step.",
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

    await commitVisitMutation((currentVisit) => {
      if (
        currentVisit.status === "completed" &&
        currentVisit.summary.syncStatus !== "synced"
      ) {
        throw new Error(
          "Sync the completed service visit before cancelling it.",
        );
      }

      const now = new Date().toISOString();

      return {
        ...currentVisit,
        status: "cancelled" as const,
        updatedAt: now,
        cancelledAt: now,
      };
    });

    setErrorMessage(null);
  }, [activeVisit, commitVisitMutation]);
  /*
   * Remove finished/cancelled visit state.
   *
   * Never remove a currently in-progress visit.
   */
  const clearCompletedVisit = useCallback(async (): Promise<void> => {
    await runVisitLifecycle(async () => {
      if (!userId) {
        return null;
      }

      const storedVisit = await loadServiceVisit(userId);

      if (storedVisit?.status === "in_progress") {
        throw new Error("An in-progress visit cannot be removed.");
      }

      if (
        storedVisit?.status === "completed" &&
        storedVisit.summary.syncStatus !== "synced"
      ) {
        throw new Error(
          "The completed service visit must sync successfully before it can be removed.",
        );
      }

      await removeServiceVisit(userId);

      return null;
    });

    setErrorMessage(null);
  }, [runVisitLifecycle, userId]);

  const clearCompletedUnifiedVisit = useCallback(async (): Promise<void> => {
    if (authStatus !== "authenticated" || !userId) {
      throw new Error("You must be signed in to clear a service visit.");
    }

    const expectedUserId = userId;
    const expectedGeneration = getAuthGeneration();
    const expectedVisitId = unifiedVisit?.id ?? null;

    await runUnifiedVisitLifecycle(async () => {
      const storedVisit = await loadMultiMachineServiceVisit(expectedUserId);

      if (!storedVisit) {
        return null;
      }

      if (!expectedVisitId || storedVisit.id !== expectedVisitId) {
        throw new Error(
          "The saved unified visit changed. Local data was preserved.",
        );
      }

      if (storedVisit.userId !== expectedUserId) {
        throw new Error("The saved visit belongs to another user.");
      }

      if (storedVisit.status === "in_progress") {
        throw new Error("An in-progress visit cannot be removed.");
      }

      if (
        storedVisit.status === "completed" &&
        storedVisit.summary.syncStatus !== "synced"
      ) {
        throw new Error(
          "The completed service visit must sync successfully before it can be removed.",
        );
      }

      if (
        storedVisit.status === "completed" &&
        hasUnsyncedMachinePhotos(storedVisit)
      ) {
        throw new Error(
          "Some machine photos have not uploaded yet. Retry photo synchronization before finishing.",
        );
      }

      if (
        storedVisit.status !== "completed" &&
        storedVisit.status !== "cancelled"
      ) {
        throw new Error(
          "This unified visit cannot be removed in its current state.",
        );
      }

      // Recheck authentication immediately before deleting local data.
      if (getAuthGeneration() !== expectedGeneration) {
        throw new Error(
          "Authentication changed. The saved visit was preserved.",
        );
      }

      await removeMultiMachineServiceVisit(expectedUserId);

      return null;
    });

    setErrorMessage(null);
  }, [
    authStatus,
    getAuthGeneration,
    runUnifiedVisitLifecycle,
    unifiedVisit,
    userId,
  ]);

  const isVisitForStop = useCallback(
    (stopId: string): boolean => {
      return [unifiedVisit, activeVisit].some(
        (visit) =>
          visit !== null &&
          visit.stopId === stopId &&
          (visit.status === "in_progress" ||
            (visit.status === "completed" &&
              visit.summary.syncStatus !== "synced")),
      );
    },
    [unifiedVisit, activeVisit],
  );

  const value = useMemo<ServiceVisitContextValue>(
    () => ({
      activeVisit,
      unifiedVisit,
      unifiedBeforePhotos,
      claimUnifiedBeforePhotoUpload,
      claimUnifiedAfterPhotoUpload,
      unifiedInventoryAudit,
      unifiedDrinkCount,
      unifiedMachineRefill,
      unifiedAfterService,
      unifiedRestock,
      completeUnifiedSummary,
      retryUnifiedSummarySync,
      advanceUnifiedVisit,
      completeUnifiedArrival,
      retryUnifiedArrivalSync,
      completeUnifiedMachineScan,
      restoringVisit,
      errorMessage,
      restoreErrorMessage,

      startVisit,
      startUnifiedVisit,

      completeArrival,
      completeMachineScan,

      saveBeforePhoto,
      updateBeforePhotoUpload,
      removeBeforePhoto,
      completeBeforePhotos,

      completeDrinkCount,

      completeInventoryAudit,
      retryInventoryAuditSync,

      completeRestockDrop,
      completeMachineRefill,
      retryLegacyMachineRefill,

      saveAfterPhoto,
      updateAfterPhotoUpload,

      saveSignature,
      updateSignatureUpload,
      removeSignature,

      unifiedClientConfirmation,

      completeAfterService,

      completeSummary,
      retrySummarySync,

      cancelVisit,
      clearCompletedVisit,
      clearCompletedUnifiedVisit,

      retryRestore,
      clearLocalVisit,

      isVisitForStop,
    }),
    [
      activeVisit,
      unifiedVisit,
      unifiedBeforePhotos,
      claimUnifiedBeforePhotoUpload,
      claimUnifiedAfterPhotoUpload,
      unifiedInventoryAudit,
      unifiedDrinkCount,
      unifiedMachineRefill,
      unifiedAfterService,
      unifiedRestock,
      completeUnifiedSummary,
      retryUnifiedSummarySync,
      advanceUnifiedVisit,
      completeUnifiedArrival,
      retryUnifiedArrivalSync,
      completeUnifiedMachineScan,
      restoringVisit,
      errorMessage,
      restoreErrorMessage,

      startVisit,
      startUnifiedVisit,

      completeArrival,
      completeMachineScan,

      saveBeforePhoto,
      updateBeforePhotoUpload,
      removeBeforePhoto,
      completeBeforePhotos,

      completeDrinkCount,

      completeInventoryAudit,
      retryInventoryAuditSync,

      completeRestockDrop,
      completeMachineRefill,
      retryLegacyMachineRefill,

      saveAfterPhoto,
      updateAfterPhotoUpload,

      saveSignature,
      updateSignatureUpload,
      removeSignature,

      unifiedClientConfirmation,

      completeAfterService,

      completeSummary,
      retrySummarySync,

      cancelVisit,
      clearCompletedVisit,
      clearCompletedUnifiedVisit,

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
