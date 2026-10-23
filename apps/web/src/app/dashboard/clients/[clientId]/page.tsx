import Link from "next/link";
import { notFound } from "next/navigation";

import { requireInventoryManager } from
  "@/lib/auth/require-inventory-manager";

import {
  getClientById,
  getClientInventoryAssignments,
} from "@/lib/clients/client-service";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientDetailsPage({
  params,
}: Props) {
  await requireInventoryManager();

  const { clientId } = await params;

  const client = await getClientById(clientId);

  if (!client) {
    notFound();
  }

  const assignments =
    await getClientInventoryAssignments(clientId);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/dashboard/clients"
        className="text-sm font-medium text-copper-600 hover:underline"
      >
        ← Back to Clients
      </Link>

      <div className="mt-6 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display text-3xl text-espresso-950">
            {client.name}
          </h1>

          <p className="mt-2 text-sm text-steam-400">
            {[client.address, client.city, client.region]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>

        <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium text-espresso-800">
          {client.business_type.toUpperCase()}
        </span>
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-espresso-950">
            Assigned Inventory Products
          </h2>

          <p className="mt-1 text-sm text-steam-400">
            {assignments.length} configured products
          </p>
        </div>

        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-latte-200 bg-crema-0 p-8 text-center text-sm text-steam-400">
            No inventory products assigned to this client yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {assignments.map((assignment) => (
              <article
                key={assignment.id}
                className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-espresso-950">
                      {assignment.product.name}
                    </h3>

                    <p className="mt-1 text-sm text-steam-400">
                      SKU: {assignment.product.sku ?? "Not assigned"}
                    </p>
                  </div>

                  <span className="rounded-full bg-latte-100 px-3 py-1 text-xs text-espresso-800">
                    {assignment.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 border-t border-latte-200 pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-steam-400">
                      Par level
                    </p>
                    <p className="font-medium text-espresso-950">
                      {assignment.par_level ?? "Not configured"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-steam-400">
                      Required
                    </p>
                    <p className="font-medium text-espresso-950">
                      {assignment.is_required ? "Yes" : "No"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-steam-400">
                      Display order
                    </p>
                    <p className="font-medium text-espresso-950">
                      {assignment.display_order}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}