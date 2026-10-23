import { requireInventoryManager } from
  "@/lib/auth/require-inventory-manager";

import { getClients } from
  "@/lib/clients/client-service";

import { ClientsManagement } from "./clients-management";

export default async function ClientsPage() {
  await requireInventoryManager();

  const clients = await getClients();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <ClientsManagement clients={clients} />
    </main>
  );
}