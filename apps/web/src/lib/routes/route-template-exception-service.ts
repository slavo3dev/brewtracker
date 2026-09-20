import type { Database } from "@brewtracker/types";

import { createAdminClient } from "@/lib/supabase/admin";

type ExceptionRow =
  Database["public"]["Tables"]["route_template_exceptions"]["Row"];

type UserRow = Database["public"]["Tables"]["users"]["Row"];

export type RouteTemplateException = ExceptionRow & {
  overrideDriver: Pick<UserRow, "id" | "full_name" | "email"> | null;
};

export type SaveRouteTemplateExceptionInput = {
  routeTemplateId: string;
  exceptionDate: string;
  isSkipped: boolean;
  overrideDriverId?: string | null;
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
