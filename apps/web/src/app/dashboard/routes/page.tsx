import { getRouteBuilderData } from "@/lib/routes/route-service";

import { RouteBuilder } from "./route-builder";

export default async function RoutesPage() {
  const { routes, drivers, warehouses, clients, machines } =
    await getRouteBuilderData();

  return (
    <RouteBuilder
      routes={routes}
      drivers={drivers}
      warehouses={warehouses}
      clients={clients}
      machines={machines}
    />
  );
}
