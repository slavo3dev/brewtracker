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

            inventoryAudit: visit.inventoryAudit,

            restockDrop: visit.restockDrop,

            /*
             * One after-service photo remains part
             * of the completed service.
             */
            afterPhoto: visit.afterService.afterPhoto,
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