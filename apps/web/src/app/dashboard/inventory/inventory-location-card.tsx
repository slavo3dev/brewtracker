import type { InventoryLocation } from "@/lib/inventory/inventory-service";

type Props = {
  location: InventoryLocation;
};

export function InventoryLocationCard({
  location,
}: Props) {
  const details = getLocationDetails(location);

  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-espresso-950">
            {details.name}
          </h3>

          {details.secondary && (
            <p className="mt-1 text-sm text-steam-400">
              {details.secondary}
            </p>
          )}
        </div>

        <span className="w-fit rounded-full bg-latte-100 px-3 py-1 text-xs font-medium text-espresso-800">
          {details.type}
        </span>
      </div>
    </article>
  );
}

function getLocationDetails(
  location: InventoryLocation,
) {
  switch (location.location_type) {
    case "warehouse":
      return {
        type: "Warehouse",
        name:
          location.warehouse?.name ??
          "Unknown warehouse",
        secondary: null,
      };

    case "driver":
      return {
        type: "Driver / Van",
        name:
          location.driver?.full_name ??
          "Unknown driver",
        secondary:
          location.driver?.email ?? null,
      };

    case "client_reserve":
      return {
        type: "Client Reserve",
        name:
          location.client?.name ??
          "Unknown client",
        secondary: "Client reserve stock",
      };

    case "machine":
      return {
        type: "Machine",
        name:
          location.machine?.name ??
          "Customer machine",
        secondary:
          location.machine?.serial_number
            ? `Serial: ${location.machine.serial_number}`
            : null,
      };
  }
}