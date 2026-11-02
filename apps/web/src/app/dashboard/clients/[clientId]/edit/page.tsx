import Link from "next/link";
import { notFound } from "next/navigation";

import { requireInventoryManager } from "@/lib/auth/require-inventory-manager";
import { getClientById } from "@/lib/clients/client-service";
import { CreateClientForm } from "../../create-client-form";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function EditClientPage({ params }: Props) {
  const profile = await requireInventoryManager();
  const { clientId } = await params;

  const client = await getClientById(clientId);

  if (!client) {
    notFound();
  }

  if (profile.role === "manager") {
    const managerRegion = profile.region?.trim().toLowerCase();
    const clientRegion = client.region?.trim().toLowerCase();

    if (!managerRegion || managerRegion !== clientRegion) {
      notFound();
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={`/dashboard/clients/${clientId}`}
        className="text-sm font-medium text-copper-600 hover:underline"
      >
        ← Back to Client
      </Link>

      <div className="mt-6 mb-8">
        <h1 className="text-display text-3xl text-espresso-950">Edit Client</h1>

        <p className="mt-2 text-sm text-steam-400">
          Update details for {client.name}.
        </p>
      </div>
      <CreateClientForm client={client} />
    </main>
  );
}
