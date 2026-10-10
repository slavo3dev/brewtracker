"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import type {
  WarehouseMovementDashboardData,
  WarehouseMovementDashboardFilters,
} from "@/lib/inventory/inventory-service";

type Props = {
  data: WarehouseMovementDashboardData;
  filters: WarehouseMovementDashboardFilters;
};

function formatQuantity(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  }).format(value);
}

export function WarehouseMovementDashboard({ data, filters }: Props) {
  const router = useRouter();

  const [warehouseId, setWarehouseId] = useState(filters.warehouseId ?? "");

  const [driverId, setDriverId] = useState(filters.driverId ?? "");

  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");

  function applyFilters() {
    const params = new URLSearchParams();

    if (warehouseId) {
      params.set("warehouse", warehouseId);
    }

    if (driverId) {
      params.set("driver", driverId);
    }

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    const query = params.toString();

    router.push(
      query
        ? `/dashboard/inventory/movements?${query}`
        : "/dashboard/inventory/movements",
    );
  }

  function clearFilters() {
    setWarehouseId("");
    setDriverId("");
    setFrom("");
    setTo("");

    router.push("/dashboard/inventory/movements");
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <section className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-espresso-950">Filters</h2>

          <p className="mt-1 text-sm text-steam-400">
            Filter movement activity by warehouse, driver, or date range.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FilterField label="Warehouse">
            <select
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              className={inputClassName}
            >
              <option value="">All warehouses</option>

              {data.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                  {warehouse.region ? ` — ${warehouse.region}` : ""}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Driver / Van">
            <select
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              className={inputClassName}
            >
              <option value="">All drivers</option>

              {data.drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name || driver.email}
                  {driver.region ? ` — ${driver.region}` : ""}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="From">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className={inputClassName}
            />
          </FilterField>

          <FilterField label="To">
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className={inputClassName}
            />
          </FilterField>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-latte-200 pt-4">
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm font-medium text-espresso-950 transition hover:bg-latte-50"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={applyFilters}
            className="rounded-xl bg-copper-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Apply filters
          </button>
        </div>
      </section>

      {/* Summary */}
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Products moved"
          value={data.summary.productCount}
          description="Products with movement activity"
        />

        <SummaryCard
          label="Movement records"
          value={data.summary.movementCount}
          description="Ledger records in this report"
        />

        <SummaryCard
          label="Drivers involved"
          value={data.summary.driverCount}
          description="Drivers represented in the results"
        />
      </section>

      {/* Product movement */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-espresso-950">
              Product movement
            </h2>

            <p className="mt-1 text-sm text-steam-400">
              Quantities are shown in each product&apos;s normalized base unit.
            </p>
          </div>

          <p className="text-sm font-medium text-steam-400">
            {data.rows.length} {data.rows.length === 1 ? "product" : "products"}
          </p>
        </div>

        {data.rows.length === 0 ? (
          <div className="rounded-2xl border border-latte-200 bg-crema-0 p-10 text-center shadow-sm">
            <p className="font-medium text-espresso-950">
              No inventory movements found.
            </p>

            <p className="mt-1 text-sm text-steam-400">
              Change the filters or record inventory movement first.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-latte-200 bg-latte-50/60">
                    <TableHeading>Product</TableHeading>

                    <TableHeading align="right">Taken</TableHeading>

                    <TableHeading align="right">Delivered</TableHeading>

                    <TableHeading align="right">Machine</TableHeading>

                    <TableHeading align="right">Returned</TableHeading>

                    <TableHeading align="right">Net</TableHeading>
                  </tr>
                </thead>

                <tbody className="divide-y divide-latte-200">
                  {data.rows.map((row) => (
                    <tr
                      key={`${row.productId}:${row.normalizedUnit}`}
                      className="transition hover:bg-latte-50/50"
                    >
                      <td className="w-[42%] max-w-[420px] px-5 py-4 align-middle">
                        <p className="font-medium leading-5 text-espresso-950">
                          {row.productName}
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-steam-400">
                          {row.sku ? <span>{row.sku}</span> : null}

                          {row.sku ? (
                            <span
                              className="h-1 w-1 rounded-full bg-latte-300"
                              aria-hidden="true"
                            />
                          ) : null}

                          <span>Unit: {row.normalizedUnit}</span>
                        </div>
                      </td>

                      <QuantityCell
                        value={row.taken}
                        unit={row.normalizedUnit}
                      />

                      <QuantityCell
                        value={row.delivered}
                        unit={row.normalizedUnit}
                      />

                      <QuantityCell
                        value={row.machineRefill}
                        unit={row.normalizedUnit}
                      />

                      <QuantityCell
                        value={row.returned}
                        unit={row.normalizedUnit}
                      />

                      <QuantityCell
                        value={row.driverNetMovement}
                        unit={row.normalizedUnit}
                        emphasize
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Explanation */}
      <section className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
        <div className="max-w-3xl">
          <h2 className="font-semibold text-espresso-950">
            About net movement
          </h2>

          <p className="mt-2 text-sm leading-6 text-steam-400">
            Driver net movement is calculated as inventory issued from
            warehouses minus client deliveries, machine refills, and warehouse
            returns for the selected period. It is a ledger movement value, not
            a confirmed physical on-hand balance.
          </p>
        </div>
      </section>
    </div>
  );
}

const inputClassName =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-3 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 focus:ring-2 focus:ring-copper-500/10";

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-espresso-950">
        {label}
      </span>

      {children}
    </label>
  );
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <p className="text-sm font-medium text-steam-400">{label}</p>

      <p className="mt-2 text-3xl font-semibold tracking-tight text-espresso-950">
        {value.toLocaleString()}
      </p>

      <p className="mt-1 text-xs text-steam-400">{description}</p>
    </div>
  );
}

function TableHeading({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-steam-400 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function QuantityCell({
  value,
  unit,
  emphasize = false,
}: {
  value: number;
  unit: string;
  emphasize?: boolean;
}) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  return (
    <td className="whitespace-nowrap px-5 py-4 text-right align-middle">
      <span
        className={
          emphasize
            ? "font-semibold text-espresso-950"
            : "text-sm text-steam-600"
        }
      >
        {emphasize && isPositive ? "+" : ""}
        {formatQuantity(value)}
      </span>

      <span className="ml-1 text-xs text-steam-400">{unit}</span>

      {emphasize && isNegative ? (
        <span className="sr-only">Negative net movement</span>
      ) : null}
    </td>
  );
}
