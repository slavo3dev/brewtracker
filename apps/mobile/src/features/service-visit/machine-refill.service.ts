import { supabase } from "../../lib/supabase";
import type { LegacyMachineRefillRecord } from "./service-visit.types";

export type MachineServiceOutcome =
  | "refilled"
  | "not_needed"
  | "unable_to_refill";

export type SaveMachineServiceConfirmationInput = {
  sourceVisitId: string;
  clientId: string;
  stopId: string;
  machineId: string;
  confirmedAt: string;
  outcome: MachineServiceOutcome;
  reason: string | null;
};

export async function saveMachineServiceConfirmation(
  input: SaveMachineServiceConfirmationInput,
): Promise<string> {
  const sourceVisitId = input.sourceVisitId.trim();
  const reason = input.reason?.trim() || null;

  if (!sourceVisitId) {
    throw new Error("A service visit ID is required.");
  }

  if (!input.confirmedAt) {
    throw new Error("A confirmation timestamp is required.");
  }

  if (input.outcome === "unable_to_refill" && !reason) {
    throw new Error(
      "A reason is required when the machine cannot be refilled.",
    );
  }

  if (input.outcome !== "unable_to_refill" && reason !== null) {
    throw new Error(
      "A reason is only allowed when the machine cannot be refilled.",
    );
  }

  const { data, error } = await supabase.rpc(
    "save_machine_service_confirmation",
    {
      p_source_visit_id: sourceVisitId,
      p_client_id: input.clientId,
      p_stop_id: input.stopId,
      p_machine_id: input.machineId,
      p_confirmed_at: input.confirmedAt,
      p_outcome: input.outcome,
      p_reason: reason,
    },
  );

  if (error) {
    throw new Error(
      error.message || "Unable to save machine service confirmation.",
    );
  }

  if (typeof data !== "string" || !data.trim()) {
    throw new Error("Machine service confirmation was saved without an ID.");
  }

  return data;
}

/**
 * FLOW-18 compatibility:
 * Synchronize a quantity-based machine refill created
 * before INV-V3-04.
 *
 * Never use this function for new confirmations.
 */
export async function syncLegacyMachineRefill(input: {
  record: LegacyMachineRefillRecord;
  clientId: string;
  stopId: string;
  machineId: string;
}): Promise<string> {
  const { record, clientId, stopId, machineId } = input;

  const sourceVisitId = record.sourceVisitId.trim();

  if (!sourceVisitId) {
    throw new Error("A legacy service visit ID is required.");
  }

  if (!record.confirmedAt || Number.isNaN(Date.parse(record.confirmedAt))) {
    throw new Error("Legacy machine refill timestamp is invalid.");
  }

  const { data, error } = await supabase.rpc("save_machine_refill", {
    p_source_visit_id: sourceVisitId,
    p_client_id: clientId,
    p_stop_id: stopId,
    p_machine_id: machineId,
    p_confirmed_at: record.confirmedAt,
    p_items: record.items.map((item) => ({
      product_id: item.productId,
      issue_quantity: item.issueQuantity,
      loose_quantity: item.looseQuantity,
      zero_reason: item.zeroReason,
      zero_reason_note: item.zeroReasonNote,
    })),
  });

  if (error) {
    throw new Error(
      error.message || "Unable to synchronize legacy machine refill.",
    );
  }

  if (typeof data !== "string" || !data.trim()) {
    throw new Error(
      "Legacy machine refill synchronization returned no database ID.",
    );
  }

  return data;
}
