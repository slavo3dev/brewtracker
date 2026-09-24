import type { Database } from "@brewtracker/types";

import { createAdminClient } from "@/lib/supabase/admin";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

type WarehouseRow = Database["public"]["Tables"]["warehouses"]["Row"];

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

type MachineRow = Database["public"]["Tables"]["machines"]["Row"];

type RouteTemplateRow = Database["public"]["Tables"]["route_templates"]["Row"];

type RouteTemplateStopRow =
  Database["public"]["Tables"]["route_template_stops"]["Row"];

export type RouteTemplateStop = RouteTemplateStopRow & {
  client: Pick<ClientRow, "id" | "name" | "address" | "city"> | null;

  machine: Pick<MachineRow, "id" | "name" | "serial_number"> | null;
};

export type RouteTemplate = RouteTemplateRow & {
  driver: Pick<UserRow, "id" | "full_name" | "email" | "region"> | null;

  warehouse: Pick<WarehouseRow, "id" | "name" | "city" | "region"> | null;

  stops: RouteTemplateStop[];
};

export type CreateRouteTemplateInput = {
  name: string;

  driverId: string;
  warehouseId: string;

  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;

  notes: string | null;

  createdBy: string;
};

export type UpdateRouteTemplateInput = {
  id: string;

  name: string;

  driverId: string;
  warehouseId: string;

  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;

  notes: string | null;
};

export type AddRouteTemplateStopInput = {
  routeTemplateId: string;

  clientId: string;
  machineId: string | null;

  scheduledStartTime: string | null;
  scheduledEndTime: string | null;

  drinkCountRequired: boolean;

  notes: string | null;
};

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function hasSelectedServiceDay(input: {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}): boolean {
  return (
    input.monday ||
    input.tuesday ||
    input.wednesday ||
    input.thursday ||
    input.friday ||
    input.saturday ||
    input.sunday
  );
}

export async function getRouteTemplates(): Promise<RouteTemplate[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("route_templates")
    .select(
      `
        *,
        driver:users!route_templates_driver_id_fkey (
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
        stops:route_template_stops (
          *,
          client:clients (
            id,
            name,
            address,
            city
          ),
          machine:machines (
            id,
            name,
            serial_number
          )
        )
      `,
    )
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(`Unable to load route templates: ${error.message}`);
  }

  const templates = (data ?? []) as RouteTemplate[];

  return templates.map((template) => ({
    ...template,

    stops: [...template.stops].sort(
      (a, b) => a.sequence_number - b.sequence_number,
    ),
  }));
}

export async function createRouteTemplate(
  input: CreateRouteTemplateInput,
): Promise<string> {
  const supabase = createAdminClient();

  const name = normalizeRequiredText(input.name, "Template name");

  normalizeRequiredText(input.driverId, "Driver");

  normalizeRequiredText(input.warehouseId, "Warehouse");

  const { data, error } = await supabase
    .from("route_templates")
    .insert({
      name,

      driver_id: input.driverId,
      warehouse_id: input.warehouseId,

      /*
       * Templates start as drafts.
       *
       * They cannot be activated until their schedule and
       * stops have been configured.
       */
      is_active: false,

      monday: input.monday,
      tuesday: input.tuesday,
      wednesday: input.wednesday,
      thursday: input.thursday,
      friday: input.friday,
      saturday: input.saturday,
      sunday: input.sunday,

      notes: input.notes?.trim() || null,

      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to create route template: ${error.message}`);
  }

  return data.id;
}

export async function updateRouteTemplate(
  input: UpdateRouteTemplateInput,
): Promise<void> {
  const supabase = createAdminClient();

  const name = normalizeRequiredText(
    input.name,
    "Template name",
  );

  normalizeRequiredText(
    input.driverId,
    "Driver",
  );

  normalizeRequiredText(
    input.warehouseId,
    "Warehouse",
  );

  const { error } = await supabase.rpc(
    "update_route_template_checked",
    {
      p_route_template_id: input.id,

      p_name: name,

      p_driver_id: input.driverId,
      p_warehouse_id: input.warehouseId,

      p_monday: input.monday,
      p_tuesday: input.tuesday,
      p_wednesday: input.wednesday,
      p_thursday: input.thursday,
      p_friday: input.friday,
      p_saturday: input.saturday,
      p_sunday: input.sunday,

      p_notes:
        input.notes?.trim() || undefined,
    },
  );

  if (error) {
    throw new Error(
      `Unable to update route template: ${error.message}`,
    );
  }
}

export async function addRouteTemplateStop(
  input: AddRouteTemplateStopInput,
): Promise<void> {
  const supabase = createAdminClient();

  normalizeRequiredText(
    input.routeTemplateId,
    "Route template",
  );

  normalizeRequiredText(
    input.clientId,
    "Client",
  );

  const { error } = await supabase.rpc(
    "add_route_template_stop_checked",
    {
      p_route_template_id:
        input.routeTemplateId,

      p_client_id:
        input.clientId,

      p_machine_id:
        input.machineId ?? undefined,

      p_scheduled_start_time:
        input.scheduledStartTime ?? undefined,

      p_scheduled_end_time:
        input.scheduledEndTime ?? undefined,

      p_drink_count_required:
        input.drinkCountRequired,

      p_notes:
        input.notes?.trim() || undefined,
    },
  );

  if (error) {
    throw new Error(
      `Unable to add route template stop: ${error.message}`,
    );
  }
}

export async function deleteRouteTemplateStop(stopId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: stop, error: stopError } = await supabase
    .from("route_template_stops")
    .select(
      `
        id,
        route_template_id,
        sequence_number
      `,
    )
    .eq("id", stopId)
    .maybeSingle();

  if (stopError) {
    throw new Error(stopError.message);
  }

  if (!stop) {
    throw new Error("Route template stop was not found.");
  }

  const { data: template, error: templateError } = await supabase
    .from("route_templates")
    .select("id, is_active")
    .eq("id", stop.route_template_id)
    .maybeSingle();

  if (templateError) {
    throw new Error(templateError.message);
  }

  if (!template) {
    throw new Error("Route template was not found.");
  }

  if (template.is_active) {
    const { count, error: countError } = await supabase
      .from("route_template_stops")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("route_template_id", stop.route_template_id);

    if (countError) {
      throw new Error(countError.message);
    }

    if ((count ?? 0) <= 1) {
      throw new Error(
        "Deactivate the route template before removing its last stop.",
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("route_template_stops")
    .delete()
    .eq("id", stopId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { data: remainingStops, error: remainingStopsError } = await supabase
    .from("route_template_stops")
    .select("id, sequence_number")
    .eq("route_template_id", stop.route_template_id)
    .order("sequence_number", {
      ascending: true,
    });

  if (remainingStopsError) {
    throw new Error(remainingStopsError.message);
  }

  for (let index = 0; index < remainingStops.length; index += 1) {
    const currentStop = remainingStops[index];

    const nextSequence = index + 1;

    if (currentStop.sequence_number === nextSequence) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("route_template_stops")
      .update({
        sequence_number: nextSequence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentStop.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}

export async function setRouteTemplateActive(
  templateId: string,
  isActive: boolean,
): Promise<void> {
  const supabase = createAdminClient();

  normalizeRequiredText(
    templateId,
    "Route template",
  );

  const { error } = await supabase.rpc(
    "set_route_template_active",
    {
      p_route_template_id: templateId,
      p_is_active: isActive,
    },
  );

  if (error) {
    throw new Error(
      `Unable to ${
        isActive ? "activate" : "deactivate"
      } route template: ${error.message}`,
    );
  }
}

export async function deleteRouteTemplate(
  templateId: string,
): Promise<void> {
  const supabase = createAdminClient();

  normalizeRequiredText(
    templateId,
    "Route template",
  );

  const { error } = await supabase.rpc(
    "delete_route_template",
    {
      p_route_template_id: templateId,
    },
  );

  if (error) {
    throw new Error(
      `Unable to delete route template: ${error.message}`,
    );
  }
}