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

  if (visit.machines.length < 2) {
    throw new Error("Multiple assigned machines are required.");
  }

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
                serialNumber:
                  machine.machineTarget.serialNumber ?? null,
              },
              drinkCount: machine.drinkCount,
              machineRefill: machine.machineRefill,
            })),
          },
        },
      },
    );

  if (error) {
    throw new Error(
      `Unable to sync completed multi-machine visit: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error("The completion service returned no result.");
  }

  return data;
}
