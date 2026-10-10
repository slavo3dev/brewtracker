import { createClient } from "@/lib/supabase/server";

import type { ServiceVisitListItem } from "./service-visit.types";

type StopRow = {
  id: string;
  route_id: string;
  client_id: string;
  machine_id: string | null;
  status: ServiceVisitListItem["status"];
  arrived_at: string | null;
  completed_at: string | null;
};

type RouteRow = {
  id: string;
  driver_id: string;
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

type UserRow = {
  id: string;
  full_name: string;
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function loadServiceVisits(): Promise<ServiceVisitListItem[]> {
  const supabase = await createClient();

  /*
   * A service visit is represented by its route stop.
   *
   * Only stops where the driver has actually arrived are
   * relevant to the Service Visits dashboard.
   *
   * arrived_at is the authoritative beginning of time
   * spent at the client location.
   *
   * completed_at is the authoritative end.
   */
  const { data: stopsData, error: stopsError } = await supabase
    .from("stops")
    .select(
      `
        id,
        route_id,
        client_id,
        machine_id,
        status,
        arrived_at,
        completed_at
      `,
    )
    .not("arrived_at", "is", null)
    .order("arrived_at", {
      ascending: false,
    })
    .limit(20);

  if (stopsError) {
    throw new Error(`Unable to load service visits: ${stopsError.message}`);
  }

  if (!stopsData?.length) {
    return [];
  }

  const stops = stopsData as StopRow[];

  const routeIds = unique(stops.map((stop) => stop.route_id));

  const clientIds = unique(stops.map((stop) => stop.client_id));

  const machineIds = unique(
    stops.flatMap((stop) => (stop.machine_id ? [stop.machine_id] : [])),
  );

  /*
   * Load route, client and machine relationships.
   *
   * We intentionally use the authenticated Supabase client
   * so existing RLS remains authoritative.
   */
  const [routesResult, clientsResult, machinesResult] = await Promise.all([
    supabase.from("routes").select("id, driver_id").in("id", routeIds),

    supabase.from("clients").select("id, name").in("id", clientIds),

    machineIds.length
      ? supabase
          .from("machines")
          .select("id, name, serial_number")
          .in("id", machineIds)
      : Promise.resolve({
          data: [] as MachineRow[],
          error: null,
        }),
  ]);

  if (routesResult.error) {
    throw new Error(
      `Unable to load service visit routes: ${routesResult.error.message}`,
    );
  }

  if (clientsResult.error) {
    throw new Error(
      `Unable to load service visit clients: ${clientsResult.error.message}`,
    );
  }

  if (machinesResult.error) {
    throw new Error(
      `Unable to load service visit machines: ${machinesResult.error.message}`,
    );
  }

  const routes = routesResult.data as RouteRow[];
  const clients = clientsResult.data as ClientRow[];
  const machines = machinesResult.data as MachineRow[];

  const routesById = new Map<string, RouteRow>(
    routes.map((route) => [route.id, route]),
  );

  const clientsById = new Map<string, ClientRow>(
    clients.map((client) => [client.id, client]),
  );

  const machinesById = new Map<string, MachineRow>(
    machines.map((machine) => [machine.id, machine]),
  );

  /*
   * We need the route driver to display who performed
   * the service visit.
   */
  const driverIds = unique(routes.map((route) => route.driver_id));

  const { data: driversData, error: driversError } = driverIds.length
    ? await supabase.from("users").select("id, full_name").in("id", driverIds)
    : {
        data: [] as UserRow[],
        error: null,
      };

  if (driversError) {
    throw new Error(
      `Unable to load service visit drivers: ${driversError.message}`,
    );
  }

  const drivers = driversData as UserRow[];

  const driversById = new Map<string, UserRow>(
    drivers.map((driver) => [driver.id, driver]),
  );

  /*
   * RLS may make one of the related rows inaccessible.
   *
   * As with technical tickets, skip an incomplete visit
   * instead of crashing the entire Service dashboard.
   */
  const visibleVisits = stops.filter((stop) => {
    const route = routesById.get(stop.route_id);
    const client = clientsById.get(stop.client_id);

    if (!route) {
      console.warn(
        "Skipping service visit with inaccessible or missing route:",
        {
          stopId: stop.id,
          routeId: stop.route_id,
        },
      );

      return false;
    }

    if (!client) {
      console.warn(
        "Skipping service visit with inaccessible or missing client:",
        {
          stopId: stop.id,
          clientId: stop.client_id,
        },
      );

      return false;
    }

    const driver = driversById.get(route.driver_id);

    if (!driver) {
      console.warn(
        "Skipping service visit with inaccessible or missing driver:",
        {
          stopId: stop.id,
          driverId: route.driver_id,
        },
      );

      return false;
    }

    return true;
  });

  return visibleVisits.map((stop): ServiceVisitListItem => {
    const route = routesById.get(stop.route_id)!;
    const client = clientsById.get(stop.client_id)!;
    const driver = driversById.get(route.driver_id)!;

    const machine = stop.machine_id
      ? machinesById.get(stop.machine_id)
      : undefined;

    return {
      id: stop.id,

      status: stop.status,

      arrivedAt: stop.arrived_at,

      completedAt: stop.completed_at,

      client: {
        id: client.id,
        name: client.name,
      },

      machine: machine
        ? {
            id: machine.id,
            name: machine.name,
            serialNumber: machine.serial_number,
          }
        : null,

      driver: {
        id: driver.id,
        fullName: driver.full_name,
      },
    };
  });
}
