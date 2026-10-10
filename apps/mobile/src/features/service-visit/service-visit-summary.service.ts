import { supabase } from "../../lib/supabase";

import type {
  CompleteServiceVisitResult,
  ServiceVisit,
} from "./service-visit.types";

type CompleteServiceVisitResponse = {
  summaryId: string;
  surveyToken: string;
  notificationStatus:
    | "pending"
    | "sent"
    | "failed"
    | "skipped";
  emailSentAt: string | null;
};

export async function syncCompletedServiceVisit(
  visit: ServiceVisit,
): Promise<CompleteServiceVisitResult> {
  if (visit.status !== "completed") {
    throw new Error(
      "Only a locally completed service visit can be synchronized.",
    );
  }

  if (!visit.completedAt) {
    throw new Error(
      "The completed service visit has no completion timestamp.",
    );
  }

  const { data, error } =
    await supabase.functions.invoke<CompleteServiceVisitResponse>(
      "complete-service-visit",
      {
        body: {
          sourceVisitId: visit.id,

          routeId: visit.routeId,
          stopId: visit.stopId,
          clientId: visit.clientId,
          machineId: visit.machineId,
          completedBy: visit.userId,

          completedAt: visit.completedAt,

          visitSummary: {
            clientName: visit.target.clientName,

            startedAt: visit.startedAt,

            completedAt: visit.completedAt,

            arrival: visit.arrivalVerification,

            machine: {
              id: visit.machineTarget.id,
              name: visit.machineTarget.name ?? null,
              model: visit.machineTarget.model ?? null,
              serialNumber:
                visit.machineTarget.serialNumber ?? null,
            },

            /*
            * FLOW-14:
            * Drink Count is optional per route stop.
            */
            drinkCount: visit.drinkCount,

            /*
            * FLOW-16:
            * Client Reserve Before Service.
            */
            inventoryAudit: visit.inventoryAudit,

            /*
            * FLOW-17:
            * Actual Driver / Van -> Client Reserve delivery.
            */
            restockDrop: visit.restockDrop,

            /*
            * FLOW-18:
            * Actual Driver / Van -> Machine refill.
            *
            * This is independent of client reserve.
            */
            machineRefill: visit.machineRefill,

            /*
            * FLOW-19:
            * Persisted Client Reserve After Service.
            *
            * Reserve After =
            *   Reserve Before + Actual Client Delivery
            */
            reserveAfter: visit.reserveAfter,

            /*
            * One after-service photo remains part
            * of the completed service.
            */
            afterPhoto: visit.afterService.afterPhoto,

            /*
            * FLOW-20:
            * Client / Manager confirmation.
            *
            * Do not send the local signature URI. The
            * signature has already been uploaded and stored
            * in service_visit_signatures.
            */
            clientConfirmation: {
              signatureId:
                visit.clientConfirmation.signature?.databaseId ??
                null,

              storagePath:
                visit.clientConfirmation.signature?.storagePath ??
                null,

              signedAt:
                visit.clientConfirmation.signature?.signedAt ??
                null,

              confirmedAt:
                visit.clientConfirmation.confirmedAt,
            },
          },
        },
      },
    );

  if (error) {
    throw new Error(
      `Unable to sync completed service visit: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "The completion service returned no result.",
    );
  }

  return data;
}