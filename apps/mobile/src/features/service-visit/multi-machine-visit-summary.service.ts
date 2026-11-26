import { supabase } from "../../lib/supabase";

import type { MultiMachineServiceVisit } from "./multi-machine-visit.types";
import type { CompleteServiceVisitResult } from "./service-visit.types";

export async function syncCompletedMultiMachineServiceVisit(
  visit: MultiMachineServiceVisit,
): Promise<CompleteServiceVisitResult> {
  if (visit.status !== "completed" || !visit.completedAt) {
    throw new Error(
      "Only a locally completed multi-machine visit can be synchronized.",
    );
  }

  if (visit.machines.length < 1) {
    throw new Error("At least one assigned machine is required.");
  }

  console.log("[Unified Completion] Payload validation", {
    schemaVersion: 2,
    sourceVisitIdPresent: Boolean(visit.id),
    routeIdPresent: Boolean(visit.routeId),
    stopIdPresent: Boolean(visit.stopId),
    clientIdPresent: Boolean(visit.clientId),
    completedByPresent: Boolean(visit.userId),
    completedAtPresent: Boolean(visit.completedAt),
    visitSummaryPresent: true,
  });

  const { data, error } =
    await supabase.functions.invoke<CompleteServiceVisitResult>(
      "complete-service-visit",
      {
        body: {
          schemaVersion: 2,
          sourceVisitId: visit.id,
          routeId: visit.routeId,
          stopId: visit.stopId,
          clientId: visit.clientId,
          completedBy: visit.userId,
          completedAt: visit.completedAt,

          visitSummary: {
            clientName: visit.target.clientName,
            startedAt: visit.startedAt,
            completedAt: visit.completedAt,
            arrival: visit.arrivalVerification,
            inventoryAudit: visit.inventoryAudit,
            restockDrop: visit.restockDrop,
            reserveAfter: visit.reserveAfter,

            machines: visit.machines.map((machine) => ({
              machineId: machine.machineId,
              sequenceNumber: machine.sequenceNumber,
              completedAt: machine.completedAt,
              machine: {
                id: machine.machineTarget.id,
                name: machine.machineTarget.name ?? null,
                model: machine.machineTarget.model ?? null,
                serialNumber: machine.machineTarget.serialNumber ?? null,
              },
              drinkCount: machine.drinkCount,
              machineRefill: machine.machineRefill,
            })),
          },
        },
      },
    );

  if (error) {
    let serverMessage: string | null = null;

    if (error.context instanceof Response) {
      try {
        const responseBody: unknown = await error.context.json();

        if (
          responseBody &&
          typeof responseBody === "object" &&
          !Array.isArray(responseBody)
        ) {
          const details = responseBody as {
            error?: unknown;
            details?: unknown;
            code?: unknown;
          };

          const message =
            typeof details.error === "string" ? details.error : error.message;

          const reason =
            typeof details.details === "string" ? details.details : null;

          const code = typeof details.code === "string" ? details.code : null;

          serverMessage = [message, reason, code ? `Code: ${code}` : null]
            .filter(Boolean)
            .join(" — ");
        }
      } catch {
        // Preserve the original Supabase error if parsing fails.
      }
    }

    throw new Error(
      `Unable to sync completed multi-machine visit: ${
        serverMessage ?? error.message
      }`,
    );
  }

  if (!data) {
    throw new Error("The completion service returned no result.");
  }

  return data;
}
