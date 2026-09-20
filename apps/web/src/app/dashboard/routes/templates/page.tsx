import { getRouteBuilderData } from "@/lib/routes/route-service";
import { getRouteTemplates } from "@/lib/routes/route-template-service";
import { getRouteTemplateExceptions } from "@/lib/routes/route-template-exception-service";

import { CreateTemplateForm } from "./create-template-form";
import { RouteTemplateCard } from "./route-template-card";

export default async function RouteTemplatesPage() {
  const [templates, routeBuilderData] = await Promise.all([
    getRouteTemplates(),
    getRouteBuilderData(),
  ]);

  const { drivers, warehouses, clients, machines } = routeBuilderData;

  const activeCount = templates.filter((template) => template.is_active).length;

  const inactiveCount = templates.length - activeCount;

  const exceptionsByTemplate = new Map(
    await Promise.all(
      templates.map(
        async (template) =>
          [template.id, await getRouteTemplateExceptions(template.id)] as const,
      ),
    ),
  );

  return (
    <>
      <section>
        <div>
          <h2 className="text-2xl font-semibold text-espresso-950">
            Route Templates
          </h2>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-steam-400">
            Configure recurring driver schedules used to automatically generate
            operational daily routes.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <TemplateMetric label="Templates" value={templates.length} />

          <TemplateMetric label="Active" value={activeCount} />

          <TemplateMetric label="Inactive" value={inactiveCount} />
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-espresso-950">
            Create template
          </h3>

          <p className="mt-1 text-sm leading-6 text-steam-400">
            Create a recurring route schedule. New templates start inactive so
            you can configure their stops before enabling automatic generation.
          </p>
        </div>

        <CreateTemplateForm drivers={drivers} warehouses={warehouses} />
      </section>

      <section className="mt-10">
        <div>
          <h3 className="text-lg font-semibold text-espresso-950">
            Recurring schedules
          </h3>

          <p className="mt-1 text-sm text-steam-400">
            {templates.length}{" "}
            {templates.length === 1 ? "template" : "templates"}
          </p>
        </div>

        {templates.length > 0 ? (
          <div className="mt-4 grid gap-5">
            {templates.map((template) => (
              <RouteTemplateCard
                key={template.id}
                template={template}
                exceptions={exceptionsByTemplate.get(template.id) ?? []}
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
              Create your first recurring route schedule above.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function TemplateMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-latte-200 bg-crema-0 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-steam-400">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold text-espresso-950">{value}</p>
    </div>
  );
}
