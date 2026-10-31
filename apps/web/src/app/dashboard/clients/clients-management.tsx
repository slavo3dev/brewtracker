"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import type { Client } from "@/lib/clients/client-service";

type Props = {
  clients: Client[];
};

export function ClientsManagement({ clients }: Props) {
  const [search, setSearch] = useState("");
  const [businessType, setBusinessType] = useState("");

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();

    return clients.filter((client) => {
      const searchable = [
        client.name,
        client.address,
        client.city,
        client.region,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (!businessType || client.business_type === businessType)
      );
    });
  }, [clients, search, businessType]);

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display text-3xl text-espresso-950">Clients</h1>

          <p className="mt-2 text-sm text-steam-400">
            Manage client locations and inventory product assignments.
          </p>
        </div>

        <Link
          href="/dashboard/clients/new"
          className="inline-flex items-center justify-center rounded-xl bg-espresso-950 px-5 py-2.5 text-sm font-medium text-crema-50 transition-colors hover:bg-copper-600"
        >
          + Add Client
        </Link>
      </div>

      <div className="mb-6 grid gap-3 rounded-2xl border border-latte-200 bg-crema-0 p-4 sm:grid-cols-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search clients..."
          aria-label="Search clients"
          className="w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500"
        />

        <select
          value={businessType}
          onChange={(event) => setBusinessType(event.target.value)}
          aria-label="Filter by business type"
          className="w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500"
        >
          <option value="">All business types</option>
          <option value="ocs">OCS</option>
          <option value="horeca">HORECA</option>
        </select>
      </div>

      <p className="mb-4 text-sm text-steam-400">
        Showing {filteredClients.length} of {clients.length} clients
      </p>

      {filteredClients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-latte-200 bg-crema-0 p-8 text-center text-sm text-steam-400">
          {clients.length === 0
            ? "No clients have been configured yet."
            : "No clients match your filters."}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredClients.map((client) => (
            <article
              key={client.id}
              className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-espresso-950">
                    {client.name}
                  </h2>

                  <p className="mt-1 text-sm text-steam-400">
                    {[client.address, client.city].filter(Boolean).join(", ") ||
                      "Address not configured"}
                  </p>
                  <Link
                    href={`/dashboard/clients/${client.id}`}
                    className="mt-3 inline-flex text-sm font-medium text-copper-600 hover:underline"
                  >
                    Manage inventory products →
                  </Link>
                </div>

                <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium text-espresso-800">
                  {client.business_type.toUpperCase()}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
