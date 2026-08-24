"use server";

import { revalidatePath } from "next/cache";

import type { Database } from "@brewtracker/types";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

const SERVICE_PATH = "/dashboard/service";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

type TechnicalTicketRow =
  Database["public"]["Tables"]["technical_tickets"]["Row"];

type TechnicalTicketUpdate =
  Database["public"]["Tables"]["technical_tickets"]["Update"];

type TechnicianRow = Pick<UserRow, "id">;

type TicketStatusRow = Pick<TechnicalTicketRow, "id" | "status">;

type ResolvableTicketRow = Pick<
  TechnicalTicketRow,
  "id" | "status" | "assigned_to"
>;

export type TechnicalTicketActionResult = {
  success: boolean;
  message: string;
};

export async function assignTechnicalTicket(
  ticketId: string,
  technicianId: string,
): Promise<TechnicalTicketActionResult> {
  await requireAdmin();

  const normalizedTicketId = ticketId.trim();

  const normalizedTechnicianId = technicianId.trim();

  if (!normalizedTicketId) {
    return {
      success: false,
      message: "A technical ticket is required.",
    };
  }

  if (!normalizedTechnicianId) {
    return {
      success: false,
      message: "Select a technician.",
    };
  }

  const supabase = await createClient();

  /*
   * Never trust the technician ID coming from the browser.
   *
   * Verify that the selected user still exists, is active,
   * and has the tech role.
   */
  const { data: technicianData, error: technicianError } = await supabase
    .from("users")
    .select("id")
    .eq("id", normalizedTechnicianId)
    .eq("role", "tech")
    .eq("is_active", true)
    .maybeSingle();

  if (technicianError) {
    return {
      success: false,
      message: `Unable to verify the technician: ${technicianError.message}`,
    };
  }

  if (!technicianData) {
    return {
      success: false,
      message: "The selected technician is unavailable.",
    };
  }

  /*
   * Explicitly bind the Supabase result to our generated
   * database type.
   */
  const technician = technicianData as TechnicianRow;

  /*
   * Load the current ticket state before allowing the
   * assignment.
   */
  const { data: ticketData, error: ticketError } = await supabase
    .from("technical_tickets")
    .select("id, status")
    .eq("id", normalizedTicketId)
    .maybeSingle();

  if (ticketError) {
    return {
      success: false,
      message: `Unable to load the technical ticket: ${ticketError.message}`,
    };
  }

  if (!ticketData) {
    return {
      success: false,
      message: "The technical ticket was not found.",
    };
  }

  const ticket = ticketData as TicketStatusRow;

  /*
   * Closed tickets cannot be assigned or reassigned.
   */
  if (ticket.status === "resolved" || ticket.status === "cancelled") {
    return {
      success: false,
      message: "A closed technical ticket cannot be assigned.",
    };
  }

  /*
   * Assignment automatically moves an open ticket into
   * the in-progress state.
   */
  const update: TechnicalTicketUpdate = {
    assigned_to: technician.id,
    status: "in_progress",
    updated_at: new Date().toISOString(),
  };

  /*
   * Supabase's generated query builder is currently
   * incorrectly resolving this table's Update argument
   * as `never`.
   *
   * Keep the payload itself strongly typed against
   * Database["..."]["technical_tickets"]["Update"].
   */
  const { error: updateError } = await supabase
    .from("technical_tickets")
    .update(update as never)
    .eq("id", normalizedTicketId)
    .in("status", ["open", "in_progress"]);

  if (updateError) {
    return {
      success: false,
      message: `Unable to assign the technical ticket: ${updateError.message}`,
    };
  }

  revalidatePath(SERVICE_PATH);

  return {
    success: true,
    message: "Technical ticket assigned.",
  };
}

export async function resolveTechnicalTicket(
  ticketId: string,
): Promise<TechnicalTicketActionResult> {
  await requireAdmin();

  const normalizedTicketId = ticketId.trim();

  if (!normalizedTicketId) {
    return {
      success: false,
      message: "A technical ticket is required.",
    };
  }

  const supabase = await createClient();

  /*
   * Load enough state to make sure this ticket can
   * legitimately transition to resolved.
   */
  const { data: ticketData, error: ticketError } = await supabase
    .from("technical_tickets")
    .select("id, status, assigned_to")
    .eq("id", normalizedTicketId)
    .maybeSingle();

  if (ticketError) {
    return {
      success: false,
      message: `Unable to load the technical ticket: ${ticketError.message}`,
    };
  }

  if (!ticketData) {
    return {
      success: false,
      message: "The technical ticket was not found.",
    };
  }

  const ticket = ticketData as ResolvableTicketRow;

  if (ticket.status === "resolved") {
    return {
      success: true,
      message: "This technical ticket is already resolved.",
    };
  }

  if (ticket.status === "cancelled") {
    return {
      success: false,
      message: "A cancelled technical ticket cannot be resolved.",
    };
  }

  /*
   * We require ownership before resolution.
   *
   * OPEN
   *   ↓ assign
   * IN_PROGRESS
   *   ↓ resolve
   * RESOLVED
   */
  if (!ticket.assigned_to) {
    return {
      success: false,
      message: "Assign a technician before resolving the ticket.",
    };
  }

  if (ticket.status !== "in_progress") {
    return {
      success: false,
      message: "Only an in-progress technical ticket can be resolved.",
    };
  }

  const now = new Date().toISOString();

  const update: TechnicalTicketUpdate = {
    status: "resolved",
    resolved_at: now,
    updated_at: now,
  };

  const { error: updateError } = await supabase
    .from("technical_tickets")
    .update(update as never)
    .eq("id", normalizedTicketId)
    .eq("status", "in_progress");

  if (updateError) {
    return {
      success: false,
      message: `Unable to resolve the technical ticket: ${updateError.message}`,
    };
  }

  revalidatePath(SERVICE_PATH);

  return {
    success: true,
    message: "Technical ticket resolved.",
  };
}
