import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";

import {
  getInventoryReconciliationHistory,
  InventoryReconciliationHistoryFilters,
  InventoryReconciliationHistoryRow,
} from "@/lib/inventory/inventory-service";

type PageProps = {
  searchParams: Promise<{
    driverId?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function InventoryReconciliationHistoryPage({
  searchParams,
}: PageProps) {
  await requireAdmin();

  const params = await searchParams;

  const filters: InventoryReconciliationHistoryFilters = {
    driverId: params.driverId ?? "",
    from: params.from ?? "",
    to: params.to ?? "",
  };

  const data =
    await getInventoryReconciliationHistory(
      filters,
    );

  const totalDiscrepancies =
    data.reconciliations.reduce(
      (total, reconciliation) =>
        total +
        reconciliation.discrepancyCount,
      0,
    );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid gap-6">
        <div className="mb-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-display text-3xl text-espresso-950">
              Reconciliation History
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-steam-400">
              Review confirmed physical inventory counts and
              investigate differences between expected and actual
              driver inventory.
            </p>
          </div>

          <Link
            href="/dashboard/inventory/reconciliation"
            className="inline-flex items-center justify-center rounded-full border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-800 transition hover:bg-latte-100"
          >
            Back to Reconciliation
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Reconciliations"
            value={data.reconciliations.length}
          />

          <SummaryCard
            label="Products counted"
            value={data.reconciliations.reduce(
              (total, reconciliation) =>
                total +
                reconciliation.productCount,
              0,
            )}
          />

          <SummaryCard
            label="Discrepancies"
            value={totalDiscrepancies}
            warning={totalDiscrepancies > 0}
          />
        </section>

        <ReconciliationFilters
          drivers={data.drivers}
          filters={filters}
        />

        <section className="grid gap-4">
          {data.reconciliations.length === 0 ? (
            <div className="rounded-2xl border border-latte-200 bg-crema-0 p-8 text-center shadow-sm">
              <h2 className="font-semibold text-espresso-950">
                No reconciliations found
              </h2>

              <p className="mt-2 text-sm text-steam-400">
                No confirmed reconciliations match
                the selected filters.
              </p>
            </div>
          ) : (
            data.reconciliations.map(
              (reconciliation) => (
                <ReconciliationCard
                  key={reconciliation.id}
                  reconciliation={
                    reconciliation
                  }
                />
              ),
            )
          )}
        </section>
      </div>
    </main>
  );
}

function ReconciliationFilters({
  drivers,
  filters,
}: {
  drivers: Awaited<
    ReturnType<
      typeof getInventoryReconciliationHistory
    >
  >["drivers"];

  filters: InventoryReconciliationHistoryFilters;
}) {
  return (
    <form
      method="get"
      className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm sm:p-6"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-steam-400">
            Driver
          </span>

          <select
            name="driverId"
            defaultValue={
              filters.driverId ?? ""
            }
            className={inputClass}
          >
            <option value="">
              All drivers
            </option>

            {drivers.map((driver) => (
              <option
                key={driver.id}
                value={driver.id}
              >
                {driver.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-steam-400">
            From
          </span>

          <input
            name="from"
            type="date"
            defaultValue={filters.from ?? ""}
            className={inputClass}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-steam-400">
            To
          </span>

          <input
            name="to"
            type="date"
            defaultValue={filters.to ?? ""}
            className={inputClass}
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-xl bg-copper-500 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Apply filters
          </button>

          <Link
            href="/dashboard/inventory/reconciliation/history"
            className="rounded-xl border border-latte-200 px-4 py-2.5 text-sm font-medium text-espresso-950 transition hover:bg-latte-50"
          >
            Clear
          </Link>
        </div>
      </div>
    </form>
  );
}

function ReconciliationCard({
  reconciliation,
}: {
  reconciliation: InventoryReconciliationHistoryRow;
}) {
  return (
    <details className="overflow-hidden rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
      <summary className="cursor-pointer list-none p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-espresso-950">
              {reconciliation.driverName}
            </div>

            <div className="mt-1 text-sm text-steam-400">
              {formatDateTime(
                reconciliation.countedAt,
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-steam-400">
              {
                reconciliation.productCount
              }{" "}
              products
            </span>

            <DiscrepancyBadge
              count={
                reconciliation.discrepancyCount
              }
            />
          </div>
        </div>
      </summary>

      <div className="border-t border-latte-200">
        <div className="grid gap-3 border-b border-latte-200 bg-latte-50/50 px-5 py-4 text-sm sm:grid-cols-3 sm:px-6">
          <div>
            <span className="text-steam-400">
              Counted by
            </span>

            <div className="mt-1 font-medium text-espresso-950">
              {reconciliation.countedByName}
            </div>
          </div>

          <div>
            <span className="text-steam-400">
              Confirmed by
            </span>

            <div className="mt-1 font-medium text-espresso-950">
              {reconciliation.confirmedByName ??
                "—"}
            </div>
          </div>

          <div>
            <span className="text-steam-400">
              Confirmed
            </span>

            <div className="mt-1 font-medium text-espresso-950">
              {reconciliation.confirmedAt
                ? formatDateTime(
                    reconciliation.confirmedAt,
                  )
                : "—"}
            </div>
          </div>

          {reconciliation.notes && (
            <div className="sm:col-span-3">
              <span className="text-steam-400">
                Notes
              </span>

              <div className="mt-1 text-espresso-950">
                {reconciliation.notes}
              </div>
            </div>
          )}
        </div>

        <div className="divide-y divide-latte-200">
          {reconciliation.items.map(
            (item) => (
              <div
                key={item.id}
                className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(220px,1.5fr)_140px_140px_140px_minmax(180px,1fr)]"
              >
                <div>
                  <div className="font-medium text-espresso-950">
                    {item.productName}
                  </div>

                  {item.sku && (
                    <div className="mt-1 text-xs text-steam-400">
                      SKU {item.sku}
                    </div>
                  )}
                </div>

                <Metric
                  label="Expected"
                  value={
                    item.expectedQuantity ===
                    null
                      ? "No baseline"
                      : formatQuantity(
                          item.expectedQuantity,
                          item.normalizedUnit,
                        )
                  }
                />

                <Metric
                  label="Physical"
                  value={formatQuantity(
                    item.physicalQuantity,
                    item.normalizedUnit,
                  )}
                />

                <Metric
                  label="Variance"
                  value={
                    item.varianceQuantity ===
                    null
                      ? "—"
                      : `${formatSigned(
                          item.varianceQuantity,
                        )} ${
                          item.normalizedUnit
                        }`
                  }
                  emphasis={
                    item.varianceQuantity ===
                    null
                      ? "neutral"
                      : item.varianceQuantity ===
                          0
                        ? "success"
                        : "warning"
                  }
                />

                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-steam-400">
                    Reason
                  </div>

                  <div className="mt-2 text-sm text-espresso-950">
                    {item.reason || "—"}
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </details>
  );
}

const inputClass =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="text-sm text-steam-400">
        {label}
      </div>

      <div
        className={`mt-2 text-2xl font-semibold ${
          warning
            ? "text-red-700"
            : "text-espresso-950"
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function DiscrepancyBadge({
  count,
}: {
  count: number;
}) {
  if (count === 0) {
    return (
      <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
        No discrepancies
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
      {count}{" "}
      {count === 1
        ? "discrepancy"
        : "discrepancies"}
    </span>
  );
}

function Metric({
  label,
  value,
  emphasis = "neutral",
}: {
  label: string;
  value: string;
  emphasis?:
    | "neutral"
    | "success"
    | "warning";
}) {
  const valueClass =
    emphasis === "success"
      ? "text-green-700"
      : emphasis === "warning"
        ? "text-red-700"
        : "text-espresso-950";

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-steam-400">
        {label}
      </div>

      <div
        className={`mt-2 text-sm font-semibold ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}

function formatQuantity(
  quantity: number,
  unit: string,
) {
  return `${quantity.toLocaleString()} ${unit}`;
}

function formatSigned(quantity: number) {
  if (quantity > 0) {
    return `+${quantity.toLocaleString()}`;
  }

  return quantity.toLocaleString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}