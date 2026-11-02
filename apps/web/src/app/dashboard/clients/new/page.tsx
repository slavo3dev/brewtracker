import Link from "next/link";

import { requireInventoryManager } from "@/lib/auth/require-inventory-manager";
import { CreateClientForm } from "../create-client-form";

export default async function NewClientPage() {
  await requireInventoryManager();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8">
        <Link
          href="/dashboard/clients"
          className="text-sm font-medium text-copper-600 hover:underline"
        >
          ← Back to Clients
        </Link>

        <h1 className="mt-5 text-display text-3xl text-espresso-950">
          Add Client
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          Register a client location, contact details, and GPS geofence.
        </p>
      </div>

      <div className="rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm">
        <CreateClientForm />
      </div>
    </main>
  );
}
