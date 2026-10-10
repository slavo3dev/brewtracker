import type { InventoryProduct } from "@/lib/inventory/inventory-service";

type Props = {
  product: InventoryProduct;
};

export function InventoryProductCard({
  product,
}: Props) {
  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-espresso-950">
              {product.name}
            </h3>

            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                product.is_active
                  ? "bg-latte-100 text-espresso-800"
                  : "bg-copper-100 text-copper-600"
              }`}
            >
              {product.is_active
                ? "Active"
                : "Inactive"}
            </span>
          </div>

          <p className="mt-1 text-sm text-steam-400">
            SKU: {product.sku ?? "Not assigned"}
          </p>
        </div>

        <span className="w-fit rounded-full bg-latte-100 px-3 py-1 text-xs font-medium capitalize text-espresso-800">
          {formatCategory(product.category)}
        </span>
      </div>

      <div className="mt-5 grid gap-4 border-t border-latte-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <Detail
          label="Base unit"
          value={product.base_unit}
        />

        <Detail
          label="Issue unit"
          value={product.issue_unit}
        />

        <Detail
          label="Conversion"
          value={`1 ${product.issue_unit} = ${
            product.units_per_issue_unit
          } ${formatUnit(
            product.base_unit,
            product.units_per_issue_unit,
          )}`}
        />

        <Detail
          label="Package"
          value={
            product.package_description ?? "—"
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <BooleanBadge
          label="Loose units"
          enabled={product.allows_loose_units}
        />

        <BooleanBadge
          label="Partial base unit"
          enabled={
            product.allows_partial_base_unit
          }
        />
      </div>
    </article>
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

function BooleanBadge({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <span className="rounded-full border border-latte-200 px-3 py-1 text-xs text-steam-400">
      {label}: {enabled ? "Allowed" : "Not allowed"}
    </span>
  );
}

function formatCategory(value: string) {
  return value
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
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