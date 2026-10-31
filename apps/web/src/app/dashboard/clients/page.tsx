import { requireInventoryManager } from
  "@/lib/auth/require-inventory-manager";

import { getClients } from
  "@/lib/clients/client-service";

import { ClientsManagement } from "./clients-management";

export default async function ClientsPage() {
  const profile = await requireInventoryManager();

  const managerRegion = profile.region?.trim().toLowerCase();

  const clients = (await getClients()).filter((client) => {
    if (profile.role === "ceo") {
      return true;
    }

    const clientRegion = client.region?.trim().toLowerCase();

    return Boolean(
      managerRegion &&
      clientRegion &&
      managerRegion === clientRegion,
    );
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <ClientsManagement clients={clients} />
    </main>
  );
}