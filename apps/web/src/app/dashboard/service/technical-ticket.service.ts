import { createClient } from "@/lib/supabase/server";

import type { Database } from "@brewtracker/types";

import type {
  TechnicalTicketListItem,
  TechnicalTicketTechnician,
} from "./technical-ticket.types";

const TECHNICAL_TICKET_BUCKET = "technical-ticket-photos";

const PHOTO_URL_EXPIRY_SECONDS = 60 * 10;

type UserRow = Database["public"]["Tables"]["users"]["Row"];

type TicketRow = {
  id: string;
  description: string;
  status: TechnicalTicketListItem["status"];

  client_id: string;
  machine_id: string;
  reported_by: string;
  assigned_to: string | null;

  photo_storage_path: string | null;

  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type ClientRow = {
  id: string;
  name: string;
};

type MachineRow = {
  id: string;
  name: string | null;
  serial_number: string | null;
};

type TechnicianRow = Pick<UserRow, "id" | "full_name">;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function loadTechnicalTickets(): Promise<
  TechnicalTicketListItem[]
> {
  const supabase = await createClient();

  /*
   * Load the tickets first.
   *
   * Related clients, machines and users are loaded separately
   * below. This keeps the Supabase query simple and avoids
   * ambiguous relationship inference for users, since both
   * reported_by and assigned_to reference public.users.
   */
  const { data: tickets, error: ticketsError } = await supabase
    .from("technical_tickets")
    .select(
      `
        id,
        description,
        status,
        client_id,
        machine_id,
        reported_by,
        assigned_to,
        photo_storage_path,
        created_at,
        updated_at,
        resolved_at
      `,
    )
    .order("created_at", {
      ascending: false,
    });

  if (ticketsError) {
    throw new Error(
      `Unable to load technical tickets: ${ticketsError.message}`,
    );
  }

  if (!tickets?.length) {
    return [];
  }

  const ticketRows = tickets as TicketRow[];

  /*
   * Build unique ID collections so each related table only
   * needs one query regardless of the number of tickets.
   */
  const clientIds = unique(ticketRows.map((ticket) => ticket.client_id));

  const machineIds = unique(ticketRows.map((ticket) => ticket.machine_id));

  const userIds = unique(
    ticketRows.flatMap((ticket) => [
      ticket.reported_by,

      ...(ticket.assigned_to ? [ticket.assigned_to] : []),
    ]),
  );

  /*
   * Load all ticket relationships concurrently.
   */
  const [clientsResult, machinesResult, usersResult] = await Promise.all([
    supabase.from("clients").select("id, name").in("id", clientIds),

    supabase
      .from("machines")
      .select("id, name, serial_number")
      .in("id", machineIds),

    supabase.from("users").select("id, full_name").in("id", userIds),
  ]);

  if (clientsResult.error) {
    throw new Error(
      `Unable to load ticket clients: ${clientsResult.error.message}`,
    );
  }

  if (machinesResult.error) {
    throw new Error(
      `Unable to load ticket machines: ${machinesResult.error.message}`,
    );
  }

  if (usersResult.error) {
    throw new Error(
      `Unable to load ticket users: ${usersResult.error.message}`,
    );
  }

  /*
   * Explicitly type the returned rows.
   *
   * This prevents TypeScript/Supabase inference from reducing
   * related user values to `never`.
   */
  const clients = clientsResult.data as ClientRow[];

  const machines = machinesResult.data as MachineRow[];

  const users = usersResult.data as UserRow[];

  /*
   * Explicit Map types make .get() predictable:
   *
   * clientsById.get()  -> ClientRow | undefined
   * machinesById.get() -> MachineRow | undefined
   * usersById.get()    -> UserRow | undefined
   */
  const clientsById = new Map<string, ClientRow>(
    clients.map((client) => [client.id, client]),
  );

  const machinesById = new Map<string, MachineRow>(
    machines.map((machine) => [machine.id, machine]),
  );

  const usersById = new Map<string, UserRow>(
    users.map((user) => [user.id, user]),
  );

  return Promise.all(
    ticketRows.map(async (ticket): Promise<TechnicalTicketListItem> => {
      const client = clientsById.get(ticket.client_id);

      const machine = machinesById.get(ticket.machine_id);

      const reporter = usersById.get(ticket.reported_by);

      const assignedUser = ticket.assigned_to
        ? usersById.get(ticket.assigned_to)
        : undefined;

      /*
       * These relationships are required for displaying
       * a usable ticket. Fail explicitly rather than
       * silently rendering incomplete data.
       */
      if (!client) {
        throw new Error(
          `Client for technical ticket ${ticket.id} could not be loaded.`,
        );
      }

      if (!machine) {
        throw new Error(
          `Machine for technical ticket ${ticket.id} could not be loaded.`,
        );
      }

      if (!reporter) {
        throw new Error(
          `Reporter for technical ticket ${ticket.id} could not be loaded.`,
        );
      }

      /*
       * Ticket photos live in a private Storage bucket.
       * Generate a short-lived signed URL for the web
       * dashboard when the ticket has a photo.
       */
      let photoUrl: string | null = null;

      if (ticket.photo_storage_path) {
        const { data: signedPhoto, error: signedPhotoError } =
          await supabase.storage
            .from(TECHNICAL_TICKET_BUCKET)
            .createSignedUrl(
              ticket.photo_storage_path,
              PHOTO_URL_EXPIRY_SECONDS,
            );

        if (signedPhotoError) {
          console.warn("Unable to create technical ticket photo URL:", {
            ticketId: ticket.id,
            error: signedPhotoError.message,
          });
        } else {
          photoUrl = signedPhoto.signedUrl;
        }
      }

      return {
        id: ticket.id,

        description: ticket.description,

        status: ticket.status,

        createdAt: ticket.created_at,

        updatedAt: ticket.updated_at,

        resolvedAt: ticket.resolved_at,

        photoStoragePath: ticket.photo_storage_path,

        photoUrl,

        client: {
          id: client.id,
          name: client.name,
        },

        machine: {
          id: machine.id,
          name: machine.name,
          serialNumber: machine.serial_number,
        },

        reporter: {
          id: reporter.id,
          fullName: reporter.full_name,
        },

        assignedTo: assignedUser
          ? {
              id: assignedUser.id,

              fullName: assignedUser.full_name,
            }
          : null,
      };
    }),
  );
}

export async function loadTechnicalTicketTechnicians(): Promise<
  TechnicalTicketTechnician[]
> {
  const supabase = await createClient();

  /*
   * Only active users with the tech role can be assigned
   * to technical tickets.
   */
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("role", "tech")
    .eq("is_active", true)
    .order("full_name", {
      ascending: true,
    });

  if (error) {
    throw new Error(`Unable to load technicians: ${error.message}`);
  }

  /*
   * Give the selected Supabase result an explicit shape.
   * This fixes the `user is never` inference you encountered.
   */
  const technicians = (data ?? []) as TechnicianRow[];

  return technicians.map((technician) => ({
    id: technician.id,
    fullName: technician.full_name,
  }));
}
