import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { MultiMachineEmailItem } from "./multi-machine-email.ts";

export async function loadMultiMachineEmailItems(
  supabaseAdmin: SupabaseClient,
  sourceVisitId: string,
  stopId: string,
  clientId: string,
  completedBy: string,
): Promise<MultiMachineEmailItem[]> {
  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("stop_machines")
    .select("machine_id, sequence_number")
    .eq("stop_id", stopId)
    .order("sequence_number", { ascending: true });

  if (assignmentError) {
    throw new Error(`Unable to load assigned machines: ${assignmentError.message}`);
  }

  if (!assignments || assignments.length < 2) {
    throw new Error("Multi-machine visit requires at least two assigned machines.");
  }

  const machineIds = assignments.map((assignment) => assignment.machine_id);

  const { data: machines, error: machineError } = await supabaseAdmin
    .from("machines")
    .select("id, client_id, name, model, serial_number")
    .in("id", machineIds);

  if (machineError) {
    throw new Error(`Unable to load machine details: ${machineError.message}`);
  }

  const { data: confirmations, error: confirmationError } = await supabaseAdmin
    .from("machine_refills")
    .select("machine_id, outcome, reason, confirmed_at")
    .eq("source_visit_id", sourceVisitId)
    .eq("stop_id", stopId)
    .eq("client_id", clientId)
    .eq("refilled_by", completedBy);

  if (confirmationError) {
    throw new Error(
      `Unable to load machine confirmations: ${confirmationError.message}`,
    );
  }

  const machineById = new Map((machines ?? []).map((machine) => [machine.id, machine]));
  const confirmationById = new Map<string, NonNullable<typeof confirmations>[number]>();

  for (const confirmation of confirmations ?? []) {
    if (confirmationById.has(confirmation.machine_id)) {
      throw new Error("Duplicate machine confirmations found.");
    }
    confirmationById.set(confirmation.machine_id, confirmation);
  }

  if (confirmationById.size !== assignments.length) {
    throw new Error("Machine confirmation count does not match assignments.");
  }

  return assignments.map((assignment) => {
    const machine = machineById.get(assignment.machine_id);
    const confirmation = confirmationById.get(assignment.machine_id);

    if (!machine || machine.client_id !== clientId || !confirmation?.confirmed_at) {
      throw new Error("Assigned machine or confirmation is missing.");
    }

    if (
      confirmation.outcome !== "refilled" &&
      confirmation.outcome !== "not_needed" &&
      confirmation.outcome !== "unable_to_refill"
    ) {
      throw new Error("Invalid machine service outcome.");
    }

    return {
      machineId: assignment.machine_id,
      sequenceNumber: assignment.sequence_number,
      name: machine.name,
      model: machine.model,
      serialNumber: machine.serial_number,
      outcome: confirmation.outcome,
      reason: confirmation.reason,
    };
  });
}
