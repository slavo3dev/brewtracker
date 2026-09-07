import { supabase } from "../../lib/supabase";

type SaveClientReserveAfterServiceInput = {
  sourceVisitId: string;
  clientId: string;
  stopId: string;
  machineId: string;
  calculatedAt: string;
};

export async function saveClientReserveAfterService({
  sourceVisitId,
  clientId,
  stopId,
  machineId,
  calculatedAt,
}: SaveClientReserveAfterServiceInput): Promise<string> {
  const { data, error } = await supabase.rpc(
    "save_client_reserve_after_service",
    {
      p_source_visit_id: sourceVisitId,
      p_client_id: clientId,
      p_stop_id: stopId,
      p_machine_id: machineId,
      p_calculated_at: calculatedAt,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (typeof data !== "string" || !data.trim()) {
    throw new Error(
      "Client reserve after-service calculation did not return a snapshot ID.",
    );
  }

  return data;
}