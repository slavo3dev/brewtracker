import type { InventoryMovement } from "@/lib/inventory/inventory-service";

type Props = {
  movement: InventoryMovement;
};

export function InventoryMovementCard({
  movement,
}: Props) {
  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-espresso-950">
              {formatMovementType(
                movement.movement_type,
              )}
            </h3>

            <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium text-espresso-800">
              {formatQuantity(
                movement.normalized_quantity,
              )}{" "}
              {formatUnit(
                movement.normalized_unit,
                movement.normalized_quantity,
              )}
            </span>
          </div>

          <p className="mt-1 text-sm text-steam-400">
            {movement.product?.name ??
              "Unknown product"}

            {movement.product?.sku
              ? ` · ${movement.product.sku}`
              : ""}
          </p>
        </div>

        <time
          dateTime={movement.occurred_at}
          className="text-sm text-steam-400"
        >
          {formatDate(movement.occurred_at)}
        </time>
      </div>

      <div className="mt-5 grid gap-4 border-t border-latte-200 pt-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <Location
          label="From"
          location={movement.from_location}
        />

        <div className="hidden text-steam-400 md:block">
          →
        </div>

        <Location
          label="To"
          location={movement.to_location}
        />
      </div>

      <div className="mt-5 grid gap-4 border-t border-latte-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <Detail
          label="Normalized quantity"
          value={`${formatQuantity(
            movement.normalized_quantity,
          )} ${formatUnit(
            movement.normalized_unit,
            movement.normalized_quantity,
          )}`}
        />

        <Detail
          label="Entered quantity"
          value={formatEnteredQuantity(movement)}
        />

        <Detail
          label="Package at movement"
          value={
            movement.package_description_snapshot ??
            `1 ${movement.issue_unit_snapshot} = ${movement.units_per_issue_unit_snapshot} ${movement.base_unit_snapshot}`
          }
        />

        <Detail
          label="Recorded by"
          value={
            movement.recorded_by_user?.full_name ??
            "Unknown user"
          }
        />
      </div>

      {(movement.source_visit_id ||
        movement.machine) && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-steam-400">
          {movement.machine && (
            <span>
              Machine:{" "}
              {movement.machine.serial_number ??
                movement.machine.name}
            </span>
          )}

          {movement.source_visit_id && (
            <span
              title={movement.source_visit_id}
              className="font-mono"
            >
              Visit:{" "}
              {shortenId(
                movement.source_visit_id,
              )}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function Location({
  label,
  location,
}: {
  label: string;
  location: InventoryMovement["from_location"];
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-steam-400">
        {label}
      </p>

      <p className="mt-1 font-medium text-espresso-950">
        {getLocationLabel(location)}
      </p>

      {location && (
        <p className="mt-0.5 text-xs text-steam-400">
          {formatLocationType(
            location.location_type,
          )}
        </p>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-steam-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-espresso-950">
        {value}
      </p>
    </div>
  );
}

function formatEnteredQuantity(
  movement: InventoryMovement,
) {
  const parts: string[] = [];

  if (movement.entered_issue_quantity > 0) {
    parts.push(
      `${formatQuantity(
        movement.entered_issue_quantity,
      )} ${formatUnit(
        movement.issue_unit_snapshot,
        movement.entered_issue_quantity,
      )}`,
    );
  }

  if (movement.entered_loose_quantity > 0) {
    parts.push(
      `${formatQuantity(
        movement.entered_loose_quantity,
      )} ${formatUnit(
        movement.base_unit_snapshot,
        movement.entered_loose_quantity,
      )}`,
    );
  }

  return parts.length > 0
    ? parts.join(" + ")
    : `${formatQuantity(
  movement.normalized_quantity,
      )} ${formatUnit(
        movement.normalized_unit,
        movement.normalized_quantity,
      )}`;
}

function getLocationLabel(
  location: InventoryMovement["from_location"],
) {
  if (!location) {
    return "External";
  }

  switch (location.location_type) {
    case "warehouse":
      return (
        location.warehouse?.name ??
        "Warehouse"
      );

    case "driver":
      return (
        location.driver?.full_name ??
        "Driver / Van"
      );

    case "client_reserve":
      return (
        location.client?.name ??
        "Client Reserve"
      );

    case "machine":
      return (
        location.machine?.name ||
        (location.machine?.serial_number
          ? `Machine ${location.machine.serial_number}`
          : "Machine")
      );
  }
}

function formatLocationType(type: string) {
  switch (type) {
    case "warehouse":
      return "Warehouse";

    case "driver":
      return "Driver / Van";

    case "client_reserve":
      return "Client Reserve";

    case "machine":
      return "Machine";

    default:
      return type;
  }
}

function formatMovementType(type: string) {
  switch (type) {
    case "warehouse_issue":
      return "Warehouse Issue";

    case "client_delivery":
      return "Client Delivery";

    case "machine_refill":
      return "Machine Refill";

    case "warehouse_return":
      return "Warehouse Return";

    case "adjustment":
      return "Inventory Adjustment";

    default:
      return type;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  }).format(value);
}

function shortenId(value: string) {
  if (value.length <= 22) {
    return value;
  }

  return `${value.slice(0, 18)}…`;
}

function formatUnit(
  unit: string,
  quantity: number,
) {
  if (quantity === 1) {
    return unit;
  }

  if (
    unit.endsWith("s") ||
    unit.endsWith("x") ||
    unit.endsWith("ch") ||
    unit.endsWith("sh")
  ) {
    return `${unit}es`;
  }

  return `${unit}s`;
}