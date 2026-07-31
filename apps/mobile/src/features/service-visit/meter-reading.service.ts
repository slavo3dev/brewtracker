import type { Database } from "@brewtracker/types";

import { supabase } from "../../lib/supabase";

type MeterReadingRow =
  Database["public"]["Tables"]["machine_meter_readings"]["Row"];

export type MachineMeterReadingResult = {
  id: string;
  machineId: string;
  serviceStopId: string | null;
  recordedBy: string | null;
  sourceVisitId: string;
  reading: number;
  previousReading: number | null;
  delta: number | null;
  recordedAt: string;
};

export type SaveMachineMeterReadingInput = {
  machineId: string;
  stopId: string;
  recordedBy: string;
  sourceVisitId: string;
  reading: number;
};

const METER_READING_SELECT = `
  id,
  machine_id,
  service_stop_id,
  recorded_by,
  source_visit_id,
  reading,
  previous_reading,
  delta,
  recorded_at
`;

function toSafeNumber(
  value: number | null,
  fieldName: string,
): number | null {
  if (value === null) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue)) {
    throw new Error(
      `${fieldName} is outside the supported numeric range.`,
    );
  }

  return numericValue;
}

function mapMeterReading(
  row: Pick<
    MeterReadingRow,
    | "id"
    | "machine_id"
    | "service_stop_id"
    | "recorded_by"
    | "source_visit_id"
    | "reading"
    | "previous_reading"
    | "delta"
    | "recorded_at"
  >,
): MachineMeterReadingResult {
  return {
    id: row.id,
    machineId: row.machine_id,
    serviceStopId: row.service_stop_id,
    recordedBy: row.recorded_by,
    sourceVisitId: row.source_visit_id,
    reading: toSafeNumber(row.reading, "Meter reading") ?? 0,
    previousReading: toSafeNumber(
      row.previous_reading,
      "Previous meter reading",
    ),
    delta: toSafeNumber(row.delta, "Meter reading delta"),
    recordedAt: row.recorded_at,
  };
}

export async function loadLatestMachineMeterReading(
  machineId: string,
): Promise<MachineMeterReadingResult | null> {
  const normalizedMachineId = machineId.trim();

  if (!normalizedMachineId) {
    throw new Error("A machine ID is required.");
  }

  const { data, error } = await supabase
    .from("machine_meter_readings")
    .select(METER_READING_SELECT)
    .eq("machine_id", normalizedMachineId)
    .order("recorded_at", {
      ascending: false,
    })
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load the latest meter reading: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return mapMeterReading(data);
}

async function loadReadingByVisitId(
  sourceVisitId: string,
): Promise<MachineMeterReadingResult | null> {
  const { data, error } = await supabase
    .from("machine_meter_readings")
    .select(METER_READING_SELECT)
    .eq("source_visit_id", sourceVisitId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to check the saved meter reading: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return mapMeterReading(data);
}

export async function saveMachineMeterReading(
  input: SaveMachineMeterReadingInput,
): Promise<MachineMeterReadingResult> {
  if (!input.machineId.trim()) {
    throw new Error("A machine ID is required.");
  }

  if (!input.stopId.trim()) {
    throw new Error("A service stop ID is required.");
  }

  if (!input.recordedBy.trim()) {
    throw new Error("A user ID is required.");
  }

  if (!input.sourceVisitId.trim()) {
    throw new Error("A service visit ID is required.");
  }

  if (
    !Number.isSafeInteger(input.reading) ||
    input.reading < 0
  ) {
    throw new Error(
      "Enter a valid non-negative whole-number meter reading.",
    );
  }

  /*
   * Check first so a retry after an app interruption does not
   * create a duplicate reading for the same local visit.
   */
  const existingReading = await loadReadingByVisitId(
    input.sourceVisitId,
  );

  if (existingReading) {
    if (
      existingReading.machineId !== input.machineId ||
      existingReading.serviceStopId !== input.stopId ||
      existingReading.reading !== input.reading
    ) {
      throw new Error(
        "This service visit already has a different meter reading.",
      );
    }

    return existingReading;
  }

  const { data, error } = await supabase
    .from("machine_meter_readings")
    .insert({
      machine_id: input.machineId,
      service_stop_id: input.stopId,
      recorded_by: input.recordedBy,
      source_visit_id: input.sourceVisitId,
      reading: input.reading,
      recorded_at: new Date().toISOString(),
    })
    .select(METER_READING_SELECT)
    .single();

  if (error) {
    /*
     * Another retry may have inserted the same visit between
     * our initial check and the insert.
     */
    if (error.code === "23505") {
      const duplicateReading = await loadReadingByVisitId(
        input.sourceVisitId,
      );

      if (duplicateReading) {
        return duplicateReading;
      }
    }

    if (
      error.code === "23514" ||
      error.message.toLowerCase().includes("cannot be lower")
    ) {
      throw new Error(
        "The new meter reading cannot be lower than the previous reading.",
      );
    }

    throw new Error(
      `Unable to save the meter reading: ${error.message}`,
    );
  }

  return mapMeterReading(data);
}