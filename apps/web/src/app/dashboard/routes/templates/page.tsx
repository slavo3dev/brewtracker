import Link from "next/link";

import { requireRouteManager } from "@/lib/auth/require-route-manager";
import { getRouteBuilderData } from "@/lib/routes/route-service";
import { getRouteTemplates } from "@/lib/routes/route-template-service";

import { CreateTemplateForm } from "./create-template-form";
import { RouteTemplateCard } from "./route-template-card";

export default async function RouteTemplatesPage() {
  await requireRouteManager();

  const [templates, routeBuilderData] = await Promise.all([
    getRouteTemplates(),
    getRouteBuilderData(),
  ]);

  const { drivers, warehouses, clients, machines } = routeBuilderData;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-copper-600">Routes</p>

          <h1 className="mt-1 text-display text-3xl text-espresso-950">
            Route Templates
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-steam-400">
            Configure recurring driver schedules that can later generate
            operational daily routes automatically.
          </p>
        </div>

        <Link
          href="/dashboard/routes"
          className="rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-800 transition hover:bg-latte-50"
        >
          Back to Daily Routes
        </Link>
      </div>

      <section className="mt-8">
        <CreateTemplateForm drivers={drivers} warehouses={warehouses} />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-espresso-950">
              Templates
            </h2>

            <p className="mt-1 text-sm text-steam-400">
              {templates.length}{" "}
              {templates.length === 1 ? "template" : "templates"}
            </p>
          </div>
        </div>

        {templates.length ? (
          <div className="mt-4 grid gap-5">
            {templates.map((template) => (
              <RouteTemplateCard
                key={template.id}
                template={template}
                drivers={drivers}
                warehouses={warehouses}
                clients={clients}
                machines={machines}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-latte-200 bg-crema-0 px-6 py-12 text-center">
            <p className="font-medium text-espresso-950">No route templates</p>

            <p className="mt-1 text-sm text-steam-400">
              Create your first recurring route template above.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
