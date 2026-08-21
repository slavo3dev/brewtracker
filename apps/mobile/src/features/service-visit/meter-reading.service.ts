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

  runningTotal: number;
  archiveTotal: number;

  recordedAt: string;
};

export type SaveMachineMeterReadingInput = {
  machineId: string;
  stopId: string;
  recordedBy: string;
  sourceVisitId: string;

  runningTotal: number;
};

const METER_READING_SELECT = `
  id,
  machine_id,
  service_stop_id,
  recorded_by,
  source_visit_id,
  reading,
  archive_total,
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
    | "archive_total"
    | "recorded_at"
  >,
): MachineMeterReadingResult {
  return {
    id: row.id,
    machineId: row.machine_id,
    serviceStopId: row.service_stop_id,
    recordedBy: row.recorded_by,
    sourceVisitId: row.source_visit_id,

    /*
     * Keep the existing database column name `reading`.
     * In the application this now represents Running Total.
     */
    runningTotal:
      toSafeNumber(row.reading, "Running Total") ?? 0,

    archiveTotal:
      toSafeNumber(row.archive_total, "Archive Total") ?? 0,

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
      `Unable to load the latest Drink Count: ${error.message}`,
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
      `Unable to check the saved Drink Count: ${error.message}`,
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
    !Number.isSafeInteger(input.runningTotal) ||
    input.runningTotal < 0
  ) {
    throw new Error(
      "Enter a valid non-negative whole-number Running Total.",
    );
  }

  /*
   * Preserve the existing retry/idempotency protection.
   *
   * If this visit already saved a Drink Count, don't create
   * another database record.
   */
  const existingReading = await loadReadingByVisitId(
    input.sourceVisitId,
  );

  if (existingReading) {
    if (
      existingReading.machineId !== input.machineId ||
      existingReading.serviceStopId !== input.stopId ||
      existingReading.runningTotal !== input.runningTotal
    ) {
      throw new Error(
        "This service visit already has a different Drink Count.",
      );
    }

    return existingReading;
  }

  /*
   * Find the previous reading for this machine so Archive Total
   * can be calculated automatically.
   */
  const previousReading = await loadLatestMachineMeterReading(
    input.machineId,
  );

  let archiveTotal: number;

  if (!previousReading) {
    /*
     * First known reading for this machine.
     *
     * Until we have a previous reading, Running Total becomes
     * the initial Archive Total.
     */
    archiveTotal = input.runningTotal;
  } else {
    /*
     * FLOW-14 does NOT support Running Total resets yet.
     */
    if (input.runningTotal < previousReading.runningTotal) {
      throw new Error(
        `Running Total cannot be lower than the previous value (${previousReading.runningTotal}).`,
      );
    }

    const difference =
      input.runningTotal - previousReading.runningTotal;

    archiveTotal =
      previousReading.archiveTotal + difference;
  }

  if (!Number.isSafeInteger(archiveTotal)) {
    throw new Error(
      "Archive Total is outside the supported numeric range.",
    );
  }

  const recordedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("machine_meter_readings")
    .insert({
      machine_id: input.machineId,
      service_stop_id: input.stopId,
      recorded_by: input.recordedBy,
      source_visit_id: input.sourceVisitId,

      /*
       * Existing DB column retained for compatibility.
       */
      reading: input.runningTotal,

      /*
       * Automatically calculated lifetime total.
       */
      archive_total: archiveTotal,

      recorded_at: recordedAt,
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
        "Running Total cannot be lower than the previous value.",
      );
    }

    throw new Error(
      `Unable to save the Drink Count: ${error.message}`,
    );
  }

  return mapMeterReading(data);
}