import type { Database } from "@brewtracker/types";
import { createAdminClient } from "@/lib/supabase/admin";

const TIME_ENTRY_SELFIES_BUCKET = "time-entry-selfies";

async function createSelfieSignedUrl(
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath) {
    return null;
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(TIME_ENTRY_SELFIES_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);

  if (error) {
    console.error("Unable to create clock-in selfie signed URL:", {
      storagePath,
      error: error.message,
    });

    return null;
  }

  return data.signedUrl;
}

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
    clock_in_selfie_signed_url: string | null;
  };

export type TimeEntryListItem =
  Database["public"]["Tables"]["time_entries"]["Row"] & {
    driver: Pick<
      Database["public"]["Tables"]["users"]["Row"],
      "id" | "full_name" | "email" | "region"
    > | null;
    warehouse: Pick<
      Database["public"]["Tables"]["warehouses"]["Row"],
      "id" | "name" | "city" | "region"
    > | null;
    route: Pick<
      Database["public"]["Tables"]["routes"]["Row"],
      "id" | "route_date" | "status"
    > | null;
    stop: Pick<
      Database["public"]["Tables"]["stops"]["Row"],
      "id" | "sequence_number" | "status"
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

  const entries = data as Omit<ReviewQueueItem, "clock_in_selfie_signed_url">[];

  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      clock_in_selfie_signed_url: await createSelfieSignedUrl(
        entry.clock_in_selfie_url,
      ),
    })),
  );
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

export async function getTimeEntries(): Promise<TimeEntryListItem[]> {
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
        region
      ),
      route:routes (
        id,
        route_date,
        status
      ),
      stop:stops (
        id,
        sequence_number,
        status
      )
    `,
    )
    .order("clock_in_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data as TimeEntryListItem[];
}

export async function autoCloseForgottenClockOuts(input: {
  reviewedBy: string;
}) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("time_entries")
    .update({
      clock_out_at: new Date().toISOString(),
      status: "flagged",
      review_status: "pending",
      review_reason: "Forgotten clock-out auto-closed after shift end.",
      auto_closed_at: new Date().toISOString(),
      auto_close_reason: "Shift ended without driver clock-out.",
      reviewed_by: input.reviewedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "open")
    .not("shift_end_at", "is", null)
    .lt("shift_end_at", new Date().toISOString());

  if (error) {
    throw new Error(error.message);
  }
}
