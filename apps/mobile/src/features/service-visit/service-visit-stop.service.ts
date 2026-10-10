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

  const { data, error } = await supabase
    .from("stops")
    .update({
      status: "in_progress",
      arrived_at: arrivedAt,
    })
    .eq("id", stopId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to save stop arrival: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Unable to save stop arrival. The assigned stop could not be updated.",
    );
  }
}