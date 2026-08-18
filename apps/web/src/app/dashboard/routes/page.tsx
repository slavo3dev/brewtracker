import { requireRouteManager } from "@/lib/auth/require-route-manager";
import { getRouteBuilderData } from "@/lib/routes/route-service";
import { RouteBuilder } from "./route-builder";

export default async function RoutesPage() {
  await requireRouteManager();

  const { routes, drivers, warehouses, clients, machines } =
    await getRouteBuilderData();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <RouteBuilder routes={routes} drivers={drivers} warehouses={warehouses} clients={clients} machines={machines} />
    </main>
  );
}