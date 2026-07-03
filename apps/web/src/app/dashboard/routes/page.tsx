import { requireRouteManager } from "@/lib/auth/require-route-manager";
import { getRouteBuilderData } from "@/lib/routes/route-service";
import { CreateRouteForm } from "./create-route-form";
import { RouteCard } from "./route-card";

export default async function RoutesPage() {
  await requireRouteManager();

  const { routes, drivers, warehouses, clients, machines } =
    await getRouteBuilderData();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-display text-3xl text-espresso-950">
          Route Builder
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          Assign drivers, create daily routes, add stops, and preview
          directions.
        </p>
      </header>

      <section className="mb-10 rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold text-espresso-950">
          Create route
        </h2>

        <CreateRouteForm drivers={drivers} warehouses={warehouses} />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-espresso-950">Routes</h2>

          <p className="text-sm text-steam-400">{routes.length} total routes</p>
        </div>

        {routes.length === 0 ? (
          <div className="rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
            No routes yet.
          </div>
        ) : (
          <div className="grid gap-5">
            {routes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                clients={clients}
                machines={machines}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
