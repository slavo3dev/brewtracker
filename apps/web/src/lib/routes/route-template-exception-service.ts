import type { Database } from "@brewtracker/types";

import { createAdminClient } from "@/lib/supabase/admin";

type ExceptionRow =
  Database["public"]["Tables"]["route_template_exceptions"]["Row"];

type StopExceptionRow =
  Database["public"]["Tables"]["route_template_stop_exceptions"]["Row"];

type UserRow = Database["public"]["Tables"]["users"]["Row"];

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

type MachineRow = Database["public"]["Tables"]["machines"]["Row"];

type RouteTemplateStopRow =
  Database["public"]["Tables"]["route_template_stops"]["Row"];

export type RouteTemplateException = ExceptionRow & {
  overrideDriver: Pick<UserRow, "id" | "full_name" | "email"> | null;
};

export type RouteTemplateStopException = StopExceptionRow & {
  client: Pick<ClientRow, "id" | "name"> | null;
  machine: Pick<MachineRow, "id" | "serial_number"> | null;
  routeTemplateStop:
    | Pick<
        RouteTemplateStopRow,
        "id" | "sequence_number" | "client_id" | "machine_id"
      >
    | null;
};

export type SaveRouteTemplateExceptionInput = {
  routeTemplateId: string;
  exceptionDate: string;
  isSkipped: boolean;
  overrideDriverId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
};

export type AddRouteStopExceptionInput = {
  routeTemplateId: string;
  exceptionDate: string;
  clientId: string;
  machineId?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  drinkCountRequired?: boolean;
  notes?: string | null;
  createdBy?: string | null;
};

export type RemoveRouteStopExceptionInput = {
  routeTemplateId: string;
  exceptionDate: string;
  routeTemplateStopId: string;
  notes?: string | null;
  createdBy?: string | null;
};

export async function getRouteTemplateExceptions(
  routeTemplateId: string,
): Promise<RouteTemplateException[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("route_template_exceptions")
    .select(
      `
      *,
      overrideDriver:users!route_template_exceptions_override_driver_id_fkey(
        id,
        full_name,
        email
      )
    `,
    )
    .eq("route_template_id", routeTemplateId)
    .order("exception_date", {
      ascending: true,
    });

  if (error) {
    throw new Error(`Unable to load route exceptions: ${error.message}`);
  }

  return (data ?? []) as RouteTemplateException[];
}

export async function getRouteTemplateStopExceptions(
  routeTemplateId: string,
): Promise<RouteTemplateStopException[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("route_template_stop_exceptions")
    .select(
      `
      *,
      client:clients(
        id,
        name
      ),
      machine:machines(
        id,
        serial_number
      ),
      routeTemplateStop:route_template_stops(
        id,
        sequence_number,
        client_id,
        machine_id
      )
    `,
    )
    .eq("route_template_id", routeTemplateId)
    .order("exception_date", {
      ascending: true,
    })
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Unable to load route stop exceptions: ${error.message}`,
    );
  }

  return (data ?? []) as RouteTemplateStopException[];
}

export async function saveRouteTemplateException(
  input: SaveRouteTemplateExceptionInput,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.rpc("apply_route_template_exception", {
    p_route_template_id: input.routeTemplateId,
    p_exception_date: input.exceptionDate,
    p_is_skipped: input.isSkipped,

    p_override_driver_id: input.isSkipped
      ? undefined
      : input.overrideDriverId || undefined,

    p_notes: input.notes?.trim() || undefined,

    p_created_by: input.createdBy || undefined,
  });

  if (error) {
    throw new Error(`Unable to apply route exception: ${error.message}`);
  }
}

export async function addRouteStopException(
  input: AddRouteStopExceptionInput,
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("add_route_stop_exception", {
    p_route_template_id: input.routeTemplateId,
    p_exception_date: input.exceptionDate,
    p_client_id: input.clientId,

    p_machine_id: input.machineId || undefined,

    p_scheduled_start_time:
      input.scheduledStartTime?.trim() || undefined,

    p_scheduled_end_time:
      input.scheduledEndTime?.trim() || undefined,

    p_drink_count_required: input.drinkCountRequired ?? false,

    p_notes: input.notes?.trim() || undefined,

    p_created_by: input.createdBy || undefined,
  });

  if (error) {
    throw new Error(`Unable to add route stop exception: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      "Unable to add route stop exception: no exception ID was returned.",
    );
  }

  return data;
}

export async function removeRouteStopException(
  input: RemoveRouteStopExceptionInput,
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("remove_route_stop_exception", {
    p_route_template_id: input.routeTemplateId,
    p_exception_date: input.exceptionDate,
    p_route_template_stop_id: input.routeTemplateStopId,

    p_notes: input.notes?.trim() || undefined,

    p_created_by: input.createdBy || undefined,
  });

  if (error) {
    throw new Error(
      `Unable to remove route stop exception: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Unable to remove route stop exception: no exception ID was returned.",
    );
  }

  return data;
}

export async function deleteRouteTemplateException(
  exceptionId: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("route_template_exceptions")
    .delete()
    .eq("id", exceptionId);

  if (error) {
    throw new Error(`Unable to remove route exception: ${error.message}`);
  }
}