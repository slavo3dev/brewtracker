import type { Database } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";

type MeterReadingRow =
  Database["public"]["Tables"]["machine_meter_readings"]["Row"];

export type MachineMeterReading = {
  id: string;
  reading: number;
  recordedAt: string;
  serviceStopId: string | null;
  notes: string | null;
};

export type MachinePassportHistory = {
  readings: MachineMeterReading[];
  latestReading: MachineMeterReading | null;
};

export async function loadMachinePassportHistory(
  machineId: string,
  limit = 5,
): Promise<MachinePassportHistory> {
  const { data, error } = await supabase
    .from("machine_meter_readings")
    .select("id, reading, recorded_at, service_stop_id, notes")
    .eq("machine_id", machineId)
    .order("recorded_at", {
      ascending: false,
    })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load machine meter history: ${error.message}`);
  }

  const rows = data as Pick<
    MeterReadingRow,
    "id" | "reading" | "recorded_at" | "service_stop_id" | "notes"
  >[];

  const readings: MachineMeterReading[] = rows.map((row) => ({
    id: row.id,
    reading: Number(row.reading),
    recordedAt: row.recorded_at,
    serviceStopId: row.service_stop_id,
    notes: row.notes,
  }));

  return {
    readings,
    latestReading: readings[0] ?? null,
  };
}
