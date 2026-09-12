"use client";

import {
  useMemo,
  useState,
} from "react";

import type {
  WarehouseTransferData,
  WarehouseTransferType,
} from "@/lib/inventory/inventory-service";

import {
  recordWarehouseTransferAction,
} from "./actions";

type Props = WarehouseTransferData;

type QuantityState = {
  issueQuantity: string;
  looseQuantity: string;
};

const inputClass =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function WarehouseTransferForm({
  warehouses,
  drivers,
  products,
}: Props) {
  const [
    movementType,
    setMovementType,
  ] = useState<WarehouseTransferType>(
    "warehouse_issue",
  );

  const [
    warehouseId,
    setWarehouseId,
  ] = useState("");

  const [
    driverId,
    setDriverId,
  ] = useState("");

  const [
    productId,
    setProductId,
  ] = useState("");

  const [
    quantity,
    setQuantity,
  ] = useState<QuantityState>({
    issueQuantity: "0",
    looseQuantity: "0",
  });

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    success,
    setSuccess,
  ] = useState<string | null>(null);

  const product = useMemo(
    () =>
      products.find(
        (item) => item.id === productId,
      ) ?? null,
    [productId, products],
  );

  const issueQuantity =
    parseNonNegativeNumber(
      quantity.issueQuantity,
    );

  const looseQuantity =
    parseNonNegativeNumber(
      quantity.looseQuantity,
    );

  const normalizedQuantity =
    product
      ? issueQuantity *
          Number(
            product.units_per_issue_unit,
          ) +
        looseQuantity
      : 0;

  const sourceLabel =
    movementType === "warehouse_issue"
      ? "Warehouse"
      : "Driver / Van";

  const destinationLabel =
    movementType === "warehouse_issue"
      ? "Driver / Van"
      : "Warehouse";

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);
    setSuccess(null);

    if (!warehouseId) {
      setError("Select a warehouse.");
      return;
    }

    if (!driverId) {
      setError("Select a driver.");
      return;
    }

    if (!product) {
      setError("Select a product.");
      return;
    }

    if (normalizedQuantity <= 0) {
      setError(
        "Transfer quantity must be greater than zero.",
      );

      return;
    }

    if (
      !product.allows_loose_units &&
      looseQuantity > 0
    ) {
      setError(
        `Loose ${product.base_unit ?? "unit"} quantities are not allowed for this product.`,
      );

      return;
    }

    setSubmitting(true);

    try {
      await recordWarehouseTransferAction({
        movementType,
        warehouseId,
        driverId,
        productId: product.id,
        issueQuantity,
        looseQuantity,
      });

      setQuantity({
        issueQuantity: "0",
        looseQuantity: "0",
      });

      setSuccess(
        movementType === "warehouse_issue"
          ? "Inventory issued to driver successfully."
          : "Inventory returned to warehouse successfully.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to record the inventory transfer.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm sm:p-6"
      >
        <div>
          <h2 className="text-lg font-semibold text-espresso-950">
            Record transfer
          </h2>

          <p className="mt-1 text-sm text-steam-400">
            Select the custody direction and enter
            the physical package quantities.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-latte-100 p-1">
          <TransferTypeButton
            active={
              movementType ===
              "warehouse_issue"
            }
            onClick={() => {
              setMovementType(
                "warehouse_issue",
              );
              setError(null);
              setSuccess(null);
            }}
          >
            Issue to driver
          </TransferTypeButton>

          <TransferTypeButton
            active={
              movementType ===
              "warehouse_return"
            }
            onClick={() => {
              setMovementType(
                "warehouse_return",
              );
              setError(null);
              setSuccess(null);
            }}
          >
            Return to warehouse
          </TransferTypeButton>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-espresso-950">
              Warehouse
            </span>

            <select
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(
                  event.target.value,
                );
              }}
              className={inputClass}
            >
              <option value="">
                Select warehouse
              </option>

              {warehouses.map(
                (warehouse) => (
                  <option
                    key={warehouse.id}
                    value={warehouse.id}
                  >
                    {warehouse.name}
                    {warehouse.region
                      ? ` — ${warehouse.region}`
                      : ""}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-espresso-950">
              Driver / Van
            </span>

            <select
              value={driverId}
              onChange={(event) => {
                setDriverId(
                  event.target.value,
                );
              }}
              className={inputClass}
            >
              <option value="">
                Select driver
              </option>

              {drivers.map((driver) => (
                <option
                  key={driver.id}
                  value={driver.id}
                >
                  {driver.full_name}
                  {driver.region
                    ? ` — ${driver.region}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-5 grid gap-2">
          <span className="text-sm font-medium text-espresso-950">
            Product
          </span>

          <select
            value={productId}
            onChange={(event) => {
              setProductId(
                event.target.value,
              );

              setQuantity({
                issueQuantity: "0",
                looseQuantity: "0",
              });

              setError(null);
              setSuccess(null);
            }}
            className={inputClass}
          >
            <option value="">
              Select product
            </option>

            {products.map((item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.sku
                  ? `${item.sku} — `
                  : ""}
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {product ? (
          <>
            <div className="mt-5 rounded-xl border border-latte-200 bg-latte-50 p-4">
              <div className="font-medium text-espresso-950">
                {product.name}
              </div>

              {product.package_description ? (
                <div className="mt-1 text-sm text-steam-400">
                  {
                    product.package_description
                  }
                </div>
              ) : null}

              <div className="mt-2 text-xs text-steam-400">
                1 {product.issue_unit} ={" "}
                {
                  product.units_per_issue_unit
                }{" "}
                {pluralize(
                  product.base_unit ??
                    "unit",
                  Number(
                    product.units_per_issue_unit,
                  ),
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-espresso-950">
                  {capitalize(
                    product.issue_unit ??
                      "Package",
                  )}{" "}
                  quantity
                </span>

                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={
                    quantity.issueQuantity
                  }
                  onChange={(event) => {
                    setQuantity(
                      (current) => ({
                        ...current,
                        issueQuantity:
                          event.target.value,
                      }),
                    );
                  }}
                  className={inputClass}
                />
              </label>

              {product.allows_loose_units ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-espresso-950">
                    Loose{" "}
                    {pluralize(
                      product.base_unit ??
                        "unit",
                      2,
                    )}
                  </span>

                  <input
                    type="number"
                    min="0"
                    step={
                      product.allows_partial_base_unit
                        ? "any"
                        : "1"
                    }
                    inputMode="decimal"
                    value={
                      quantity.looseQuantity
                    }
                    onChange={(event) => {
                      setQuantity(
                        (current) => ({
                          ...current,
                          looseQuantity:
                            event.target.value,
                        }),
                      );
                    }}
                    className={inputClass}
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-5 rounded-xl bg-copper-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-copper-700">
                Total transfer
              </div>

              <div className="mt-1 text-lg font-semibold text-espresso-950">
                {formatQuantity(
                  normalizedQuantity,
                )}{" "}
                {pluralize(
                  product.base_unit ??
                    "unit",
                  normalizedQuantity,
                )}
              </div>
            </div>
          </>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={
            submitting ||
            normalizedQuantity <= 0
          }
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-espresso-950 px-5 py-3 text-sm font-semibold text-crema-50 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting
            ? "Recording transfer..."
            : movementType ===
                "warehouse_issue"
              ? "Issue inventory to driver"
              : "Record warehouse return"}
        </button>
      </form>

      <aside className="h-fit rounded-2xl border border-latte-200 bg-crema-0 p-5">
        <h2 className="font-semibold text-espresso-950">
          Custody movement
        </h2>

        <div className="mt-5 grid gap-3">
          <CustodyBox
            label="From"
            value={sourceLabel}
          />

          <div className="text-center text-xl text-copper-600">
            ↓
          </div>

          <CustodyBox
            label="To"
            value={destinationLabel}
          />
        </div>

        <p className="mt-5 text-xs leading-5 text-steam-400">
          Each confirmed transfer creates an
          immutable inventory movement. Existing
          movement history cannot be edited or
          deleted.
        </p>
      </aside>
    </div>
  );
}

function TransferTypeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-3 py-2.5 text-sm font-medium transition",
        active
          ? "bg-crema-0 text-espresso-950 shadow-sm"
          : "text-steam-400 hover:text-espresso-950",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function CustodyBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-latte-100 p-4">
      <div className="text-xs uppercase tracking-wide text-steam-400">
        {label}
      </div>

      <div className="mt-1 font-medium text-espresso-950">
        {value}
      </div>
    </div>
  );
}

function parseNonNegativeNumber(
  value: string,
): number {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return 0;
  }

  return parsed;
}

function capitalize(
  value: string,
): string {
  if (!value) {
    return value;
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function formatQuantity(
  value: number,
): string {
  return Number.isInteger(value)
    ? String(value)
    : String(
        Number(value.toFixed(3)),
      );
}

function pluralize(
  unit: string,
  quantity: number,
): string {
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