import type { Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type TimeEntryReviewStatus =
  Database["public"]["Enums"]["time_entry_review_status"];

export type ReviewQueueItem =
  Database["public"]["Tables"]["time_entries"]["Row"] & {
    driver: Pick<
      Database["public"]["Tables"]["users"]["Row"],
      "id" | "full_name" | "email" | "region"
    > | null;
    warehouse: Pick<
      Database["public"]["Tables"]["warehouses"]["Row"],
      | "id"
      | "name"
      | "city"
      | "region"
      | "latitude"
      | "longitude"
      | "geofence_radius_meters"
    > | null;
  };

export async function getTimeEntryReviewQueue(): Promise<ReviewQueueItem[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("time_entries")
    .select(
      `
      *,
      driver:users!time_entries_driver_id_fkey (
        id,
        full_name,
        email,
        region
      ),
      warehouse:warehouses (
        id,
        name,
        city,
        region,
        latitude,
        longitude,
        geofence_radius_meters
      )
    `,
    )
    .eq("review_status", "pending")
    .order("clock_in_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data as ReviewQueueItem[];
}

export async function reviewTimeEntry(input: {
  timeEntryId: string;
  reviewedBy: string;
  reviewStatus: TimeEntryReviewStatus;
  reviewNote: string | null;
}) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("time_entries")
    .update({
      review_status: input.reviewStatus,
      reviewed_by: input.reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_note: input.reviewNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.timeEntryId);

  if (error) {
    throw new Error(error.message);
  }
}