import { useCallback, type Dispatch, type SetStateAction } from "react";

import { saveClientDelivery } from "../../src/features/service-visit/restock-drop.service";
import { prepareRestockDrop } from "../features/service-visit/restock-drop.prepare";

import {
  ReserveAfterSyncError,
  syncReserveAfter,
} from "../features/service-visit/client-reserve-after.sync";

import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";

import {
  type CompleteRestockDropInput,
  type ServiceVisit,
} from "../../src/features/service-visit/service-visit.types";

import { transitionToNextStep } from "../../src/features/service-visit/state/service-visit.transitions";

type UseRestockStepParams = {
  activeVisit: ServiceVisit | null;

  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;

  setErrorMessage: Dispatch<SetStateAction<string | null>>;
};

export function useRestockStep({
  activeVisit,
  setActiveVisit,
  setErrorMessage,
}: UseRestockStepParams) {
  const completeRestockDrop = useCallback(
    async (input: CompleteRestockDropInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "restock") {
        throw new Error("Delivery can only be completed during Step 6.");
      }

      // Delivery is already synced.
      // Resume reserve-after without submitting delivery again.
      if (
        activeVisit.restockDrop?.syncStatus === "synced" &&
        activeVisit.restockDrop.databaseId
      ) {
        try {
          const syncedVisit = await syncReserveAfter(activeVisit);

          const transitionedVisit = transitionToNextStep(
            syncedVisit,
            "restock",
            new Date().toISOString(),
          );

          await saveServiceVisit(transitionedVisit);

          setActiveVisit(transitionedVisit);
          setErrorMessage(null);

          return transitionedVisit;
        } catch (error) {
          if (error instanceof ReserveAfterSyncError) {
            setActiveVisit(error.visit);
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to sync client reserve after delivery.",
          );

          throw error;
        }
      }

      const existingDelivery = activeVisit.restockDrop;

      if (existingDelivery && existingDelivery.syncStatus !== "synced") {
        let databaseId: string;

        try {
          databaseId = await saveClientDelivery({
            sourceVisitId: existingDelivery.sourceVisitId,
            clientId: activeVisit.clientId,
            stopId: activeVisit.stopId,
            machineId: activeVisit.machineId,
            confirmedAt: existingDelivery.confirmedAt,
            quantities: existingDelivery.items.map((item) => ({
              productId: item.productId,
              issueQuantity: item.issueQuantity,
              looseQuantity: item.looseQuantity,
            })),
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to sync the client delivery.";

          const failedVisit: ServiceVisit = {
            ...activeVisit,
            restockDrop: {
              ...existingDelivery,
              syncStatus: "failed",
              syncError: message,
            },
            updatedAt: new Date().toISOString(),
          };

          await saveServiceVisit(failedVisit);
          setActiveVisit(failedVisit);
          setErrorMessage(message);

          throw error;
        }

        const syncedDeliveryVisit: ServiceVisit = {
          ...activeVisit,
          restockDrop: {
            ...existingDelivery,
            databaseId,
            syncStatus: "synced",
            syncError: null,
          },
          updatedAt: new Date().toISOString(),
        };

        try {
          await saveServiceVisit(syncedDeliveryVisit);
        } catch (error) {
          setActiveVisit(syncedDeliveryVisit);

          setErrorMessage(
            "Delivery was saved to Supabase, but local storage failed. Please retry.",
          );

          throw error;
        }

        setActiveVisit(syncedDeliveryVisit);

        try {
          const syncedVisit = await syncReserveAfter(syncedDeliveryVisit);

          const transitionedVisit = transitionToNextStep(
            syncedVisit,
            "restock",
            new Date().toISOString(),
          );

          await saveServiceVisit(transitionedVisit);
          setActiveVisit(transitionedVisit);
          setErrorMessage(null);

          return transitionedVisit;
        } catch (error) {
          if (error instanceof ReserveAfterSyncError) {
            setActiveVisit(error.visit);
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to sync client reserve after delivery.",
          );

          throw error;
        }
      }

      const reserveBefore = activeVisit.inventoryAudit;

      if (
        !reserveBefore ||
        reserveBefore.syncStatus !== "synced" ||
        !reserveBefore.databaseId
      ) {
        throw new Error(
          "The client reserve count must be synced before delivery.",
        );
      }

      const items = prepareRestockDrop(input, reserveBefore);

      const confirmedAt =
        activeVisit.restockDrop?.confirmedAt ?? new Date().toISOString();

      const pendingVisit: ServiceVisit = {
        ...activeVisit,

        restockDrop: {
          databaseId: null,

          sourceVisitId: activeVisit.id,

          confirmedAt,

          items,

          syncStatus: "pending_sync",

          syncError: null,
        },

        updatedAt: confirmedAt,
      };

      await saveServiceVisit(pendingVisit);

      setActiveVisit(pendingVisit);

      let databaseId: string;

      try {
        databaseId = await saveClientDelivery({
          sourceVisitId: activeVisit.id,
          clientId: activeVisit.clientId,
          stopId: activeVisit.stopId,
          machineId: activeVisit.machineId,
          confirmedAt,
          quantities: input.quantities,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sync the client delivery.";

        const failedVisit: ServiceVisit = {
          ...pendingVisit,
          restockDrop: {
            ...pendingVisit.restockDrop!,
            syncStatus: "failed",
            syncError: message,
          },
          updatedAt: new Date().toISOString(),
        };

        await saveServiceVisit(failedVisit);
        setActiveVisit(failedVisit);
        setErrorMessage(message);

        throw error;
      }

      // Supabase has confirmed the delivery.
      // Do not mark it as failed if local persistence fails.
      const syncedDeliveryVisit: ServiceVisit = {
        ...pendingVisit,
        restockDrop: {
          ...pendingVisit.restockDrop!,
          databaseId,
          syncStatus: "synced",
          syncError: null,
        },
        updatedAt: new Date().toISOString(),
      };

      // Preserve the successful RPC result in React state.
      setActiveVisit(syncedDeliveryVisit);

      try {
        await saveServiceVisit(syncedDeliveryVisit);
      } catch (error) {
        setErrorMessage(
          "Delivery was saved to Supabase, but local storage failed. Please retry.",
        );

        throw error;
      }

      // Delivery is now synced.
      // Reserve-after is a separate operation.
      try {
        const syncedReserveAfterVisit =
          await syncReserveAfter(syncedDeliveryVisit);

        const transitionedVisit = transitionToNextStep(
          syncedReserveAfterVisit,
          "restock",
          new Date().toISOString(),
        );

        await saveServiceVisit(transitionedVisit);

        setActiveVisit(transitionedVisit);
        setErrorMessage(null);

        return transitionedVisit;
      } catch (error) {
        if (error instanceof ReserveAfterSyncError) {
          setActiveVisit(error.visit);
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to sync client reserve after delivery.",
        );

        throw error;
      }
    },
    [activeVisit, setActiveVisit, setErrorMessage],
  );

  return {
    completeRestockDrop,
  };
}
