"use client";

import { useMemo, useState } from "react";

import type {
  WarehouseTransferData,
  WarehouseTransferProduct,
  WarehouseTransferType,
} from "@/lib/inventory/inventory-service";

import { recordWarehouseTransferAction } from "./actions";

type Props = WarehouseTransferData;

type TransferItemState = {
  id: string;
  productId: string;
  issueQuantity: string;
  looseQuantity: string;
};

const inputClass =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

function createTransferItem(): TransferItemState {
  return {
    id: crypto.randomUUID(),
    productId: "",
    issueQuantity: "0",
    looseQuantity: "0",
  };
}

export function WarehouseTransferForm({
  warehouses,
  drivers,
  products,
}: Props) {
  const [movementType, setMovementType] =
    useState<WarehouseTransferType>("warehouse_issue");

  const [warehouseId, setWarehouseId] = useState("");

  const [driverId, setDriverId] = useState("");

  const [items, setItems] = useState<TransferItemState[]>(() => [
    createTransferItem(),
  ]);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  const selectedProductIds = useMemo(
    () => new Set(items.map((item) => item.productId).filter(Boolean)),
    [items],
  );

  const sourceLabel =
    movementType === "warehouse_issue" ? "Warehouse" : "Driver / Van";

  const destinationLabel =
    movementType === "warehouse_issue" ? "Driver / Van" : "Warehouse";

  function updateItem(id: string, updates: Partial<TransferItemState>) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...updates,
            }
          : item,
      ),
    );

    setError(null);
    setSuccess(null);
  }

  function addItem() {
    setItems((current) => [...current, createTransferItem()]);

    setError(null);
    setSuccess(null);
  }

  function removeItem(id: string) {
    setItems((current) => {
      if (current.length === 1) {
        return current;
      }

      return current.filter((item) => item.id !== id);
    });

    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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

    const transferItems = [];

    for (const item of items) {
      const product = products.find(
        (candidate) => candidate.id === item.productId,
      );

      if (!product) {
        setError("Select a product for every transfer item.");
        return;
      }

      const issueQuantity = parseNonNegativeNumber(item.issueQuantity);

      const looseQuantity = parseNonNegativeNumber(item.looseQuantity);

      const normalizedQuantity =
        issueQuantity * Number(product.units_per_issue_unit) + looseQuantity;

      if (normalizedQuantity <= 0) {
        setError(
          `${product.name}: transfer quantity must be greater than zero.`,
        );
        return;
      }

      if (!product.allows_loose_units && looseQuantity > 0) {
        setError(
          `${product.name}: loose ${
            product.base_unit ?? "unit"
          } quantities are not allowed.`,
        );
        return;
      }

      if (!Number.isInteger(issueQuantity)) {
        setError(`${product.name}: package quantity must be a whole number.`);
        return;
      }

      if (
        !product.allows_partial_base_unit &&
        !Number.isInteger(looseQuantity)
      ) {
        setError(
          `${product.name}: partial base-unit quantities are not allowed.`,
        );
        return;
      }

      transferItems.push({
        productId: product.id,
        issueQuantity,
        looseQuantity,
      });
    }

    const productIds = transferItems.map((item) => item.productId);

    if (new Set(productIds).size !== productIds.length) {
      setError("The same product cannot be added more than once.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await recordWarehouseTransferAction({
        movementType,
        warehouseId,
        driverId,
        items: transferItems,
      });

      setItems([createTransferItem()]);

      setSuccess(
        movementType === "warehouse_issue"
          ? `${result.movementIds.length} product${
              result.movementIds.length === 1 ? "" : "s"
            } issued to driver successfully.`
          : `${result.movementIds.length} product${
              result.movementIds.length === 1 ? "" : "s"
            } returned to warehouse successfully.`,
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

  const canAddProduct = selectedProductIds.size < products.length;

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
            Select the custody direction and add one or more inventory products.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-latte-100 p-1">
          <TransferTypeButton
            active={movementType === "warehouse_issue"}
            onClick={() => {
              setMovementType("warehouse_issue");
              setError(null);
              setSuccess(null);
            }}
          >
            Issue to driver
          </TransferTypeButton>

          <TransferTypeButton
            active={movementType === "warehouse_return"}
            onClick={() => {
              setMovementType("warehouse_return");
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
                setWarehouseId(event.target.value);
                setError(null);
                setSuccess(null);
              }}
              className={inputClass}
            >
              <option value="">Select warehouse</option>

              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                  {warehouse.region ? ` — ${warehouse.region}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-espresso-950">
              Driver / Van
            </span>

            <select
              value={driverId}
              onChange={(event) => {
                setDriverId(event.target.value);
                setError(null);
                setSuccess(null);
              }}
              className={inputClass}
            >
              <option value="">Select driver</option>

              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name}
                  {driver.region ? ` — ${driver.region}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-7">
          <div>
            <h3 className="font-semibold text-espresso-950">Products</h3>

            <p className="mt-1 text-sm text-steam-400">
              Enter package and loose quantities separately for each product.
            </p>
          </div>

          <div className="mt-4 grid gap-4">
            {items.map((item, index) => (
              <TransferProductCard
                key={item.id}
                item={item}
                index={index}
                products={products}
                selectedProductIds={selectedProductIds}
                canRemove={items.length > 1}
                onChange={(updates) => {
                  updateItem(item.id, updates);
                }}
                onRemove={() => {
                  removeItem(item.id);
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            disabled={!canAddProduct || submitting}
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-latte-200 bg-crema-0 px-4 py-2 text-sm font-medium text-espresso-950 transition hover:bg-latte-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add Product
          </button>
        </div>

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
          disabled={submitting}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-espresso-950 px-5 py-3 text-sm font-semibold text-crema-50 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting
            ? "Recording transfer..."
            : movementType === "warehouse_issue"
              ? "Issue inventory to driver"
              : "Record warehouse return"}
        </button>
      </form>

      <aside className="h-fit rounded-2xl border border-latte-200 bg-crema-0 p-5">
        <h2 className="font-semibold text-espresso-950">Custody movement</h2>

        <div className="mt-5 grid gap-3">
          <CustodyBox label="From" value={sourceLabel} />

          <div className="text-center text-xl text-copper-600">↓</div>

          <CustodyBox label="To" value={destinationLabel} />
        </div>

        <p className="mt-5 text-xs leading-5 text-steam-400">
          Each product creates its own immutable inventory movement. A
          multi-product transfer is recorded atomically.
        </p>
      </aside>
    </div>
  );
}

function TransferProductCard({
  item,
  index,
  products,
  selectedProductIds,
  canRemove,
  onChange,
  onRemove,
}: {
  item: TransferItemState;
  index: number;
  products: WarehouseTransferProduct[];
  selectedProductIds: Set<string>;
  canRemove: boolean;
  onChange: (updates: Partial<TransferItemState>) => void;
  onRemove: () => void;
}) {
  const product =
    products.find((candidate) => candidate.id === item.productId) ?? null;

  const issueQuantity = parseNonNegativeNumber(item.issueQuantity);

  const looseQuantity = parseNonNegativeNumber(item.looseQuantity);

  const normalizedQuantity = product
    ? issueQuantity * Number(product.units_per_issue_unit) + looseQuantity
    : 0;

  return (
    <div className="rounded-2xl border border-latte-200 bg-latte-50 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-espresso-950">
          Product {index + 1}
        </div>

        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-sm font-medium text-red-600 transition hover:text-red-700"
          >
            Remove
          </button>
        ) : null}
      </div>

      <label className="mt-4 grid gap-2">
        <span className="text-sm font-medium text-espresso-950">Product</span>

        <select
          value={item.productId}
          onChange={(event) => {
            onChange({
              productId: event.target.value,
              issueQuantity: "0",
              looseQuantity: "0",
            });
          }}
          className={inputClass}
        >
          <option value="">Select product</option>

          {products.map((candidate) => {
            const alreadySelected =
              selectedProductIds.has(candidate.id) &&
              candidate.id !== item.productId;

            return (
              <option
                key={candidate.id}
                value={candidate.id}
                disabled={alreadySelected}
              >
                {candidate.sku ? `${candidate.sku} — ` : ""}
                {candidate.name}
              </option>
            );
          })}
        </select>
      </label>

      {product ? (
        <>
          <div className="mt-4 rounded-xl border border-latte-200 bg-crema-0 p-4">
            <div className="font-medium text-espresso-950">{product.name}</div>

            {product.package_description ? (
              <div className="mt-1 text-sm text-steam-400">
                {product.package_description}
              </div>
            ) : null}

            <div className="mt-2 text-xs text-steam-400">
              1 {product.issue_unit} = {product.units_per_issue_unit}{" "}
              {pluralize(
                product.base_unit ?? "unit",
                Number(product.units_per_issue_unit),
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-espresso-950">
                {capitalize(product.issue_unit ?? "Package")} quantity
              </span>

              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={item.issueQuantity}
                onChange={(event) => {
                  onChange({
                    issueQuantity: event.target.value,
                  });
                }}
                className={inputClass}
              />
            </label>

            {product.allows_loose_units ? (
              <label className="grid gap-2">
                <span className="text-sm font-medium text-espresso-950">
                  Loose {pluralize(product.base_unit ?? "unit", 2)}
                </span>

                <input
                  type="number"
                  min="0"
                  step={product.allows_partial_base_unit ? "any" : "1"}
                  inputMode="decimal"
                  value={item.looseQuantity}
                  onChange={(event) => {
                    onChange({
                      looseQuantity: event.target.value,
                    });
                  }}
                  className={inputClass}
                />
              </label>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl bg-copper-50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-copper-700">
              Total transfer
            </div>

            <div className="mt-1 text-lg font-semibold text-espresso-950">
              {formatQuantity(normalizedQuantity)}{" "}
              {pluralize(product.base_unit ?? "unit", normalizedQuantity)}
            </div>
          </div>
        </>
      ) : null}
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

function CustodyBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-latte-100 p-4">
      <div className="text-xs uppercase tracking-wide text-steam-400">
        {label}
      </div>

      <div className="mt-1 font-medium text-espresso-950">{value}</div>
    </div>
  );
}

function parseNonNegativeNumber(value: string): number {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatQuantity(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(3)));
}

function pluralize(unit: string, quantity: number): string {
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
