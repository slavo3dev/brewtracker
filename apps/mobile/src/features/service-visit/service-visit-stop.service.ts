import { supabase } from "../../lib/supabase";

export async function markServiceStopArrived(
  stopId: string,
  arrivedAt: string,
): Promise<void> {
  if (!stopId) {
    throw new Error("A stop is required to confirm arrival.");
  }

  if (!arrivedAt || Number.isNaN(Date.parse(arrivedAt))) {
    throw new Error("A valid arrival timestamp is required.");
  }

  const { error } = await supabase.rpc(
    "mark_service_stop_arrived",
    {
      p_stop_id: stopId,
      p_arrived_at: arrivedAt,
    },
  );

  if (error) {
    throw new Error(
      `Unable to save stop arrival: ${error.message}`,
    );
  }
}