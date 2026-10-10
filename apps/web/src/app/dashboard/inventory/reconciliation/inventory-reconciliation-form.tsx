"use client";

import { useMemo, useState } from "react";

import type {
  InventoryExpectedBalance,
  InventoryReconciliationDetail,
  InventoryReconciliationDriver,
  InventoryReconciliationProduct,
} from "@/lib/inventory/inventory-service";

import {
  confirmNewInventoryReconciliationAction,
  loadDriverExpectedInventoryAction,
} from "./actions";

type Props = {
  drivers: InventoryReconciliationDriver[];
  products: InventoryReconciliationProduct[];
};

type CountState = {
  physicalQuantity: string;
  reason: string;
};

type ReviewItem = {
  productId: string;
  productName: string;
  sku: string | null;
  expectedQuantity: number | null;
  physicalQuantity: number;
  varianceQuantity: number | null;
  normalizedUnit: string;
  reason: string;
};

type ReconciliationReviewState = {
  driverId: string;
  notes: string;
  items: ReviewItem[];
};

const inputClass =
  "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none transition focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function InventoryReconciliationForm({
  drivers,
  products,
}: Props) {
  const [driverId, setDriverId] = useState("");

  const [expected, setExpected] = useState<
    InventoryExpectedBalance[]
  >([]);

  const [counts, setCounts] = useState<
    Record<string, CountState>
  >({});

  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [review, setReview] =
    useState<ReconciliationReviewState | null>(null);

  const [confirmedReconciliation, setConfirmedReconciliation] =
    useState<InventoryReconciliationDetail | null>(null);

  const expectedByProductId = useMemo(
    () =>
      new Map(
        expected.map((item) => [item.productId, item]),
      ),
    [expected],
  );

  async function handleDriverChange(nextDriverId: string) {
    setDriverId(nextDriverId);
    setExpected([]);
    setCounts({});
    setReview(null);
    setConfirmedReconciliation(null);
    setError(null);

    if (!nextDriverId) {
      return;
    }

    setLoading(true);

    try {
      const balances =
        await loadDriverExpectedInventoryAction(nextDriverId);

      setExpected(balances);

      setCounts(
        Object.fromEntries(
          products.map((product) => [
            product.id,
            {
              physicalQuantity: "",
              reason: "",
            },
          ]),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load expected inventory.",
      );
    } finally {
      setLoading(false);
    }
  }

  function updateCount(
    productId: string,
    update: Partial<CountState>,
  ) {
    setCounts((current) => ({
      ...current,

      [productId]: {
        physicalQuantity:
          current[productId]?.physicalQuantity ?? "",
        reason: current[productId]?.reason ?? "",
        ...update,
      },
    }));

    setError(null);
  }

  function handleSubmit(
  event: React.FormEvent<HTMLFormElement>,
) {
  event.preventDefault();

  setError(null);

  if (!driverId) {
    setError("Select a driver.");
    return;
  }

  const reviewItems: ReviewItem[] = [];

  for (const product of products) {
    const count = counts[product.id];

    if (!count?.physicalQuantity.trim()) {
      continue;
    }

    const physicalQuantity = Number(
      count.physicalQuantity,
    );

    if (
      !Number.isFinite(physicalQuantity) ||
      physicalQuantity < 0
    ) {
      setError(
        `${product.name}: enter a valid physical quantity.`,
      );
      return;
    }

    const balance =
      expectedByProductId.get(product.id);

    const expectedQuantity =
      balance?.hasBaseline
        ? balance.expectedQuantity
        : null;

    const varianceQuantity =
      expectedQuantity === null
        ? null
        : physicalQuantity - expectedQuantity;

    reviewItems.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      expectedQuantity,
      physicalQuantity,
      varianceQuantity,
      normalizedUnit:
        balance?.normalizedUnit ?? product.base_unit,
      reason: count.reason.trim(),
    });
  }

  if (reviewItems.length === 0) {
    setError(
      "Enter at least one physical inventory count.",
    );
    return;
  }

  setReview({
    driverId,
    notes,
    items: reviewItems,
  });
}

  async function handleConfirm() {
  if (!review) {
    return;
  }

  setError(null);
  setConfirming(true);

  try {
    const result =
      await confirmNewInventoryReconciliationAction({
        driverId: review.driverId,
        notes: review.notes,
        items: review.items.map((item) => ({
          productId: item.productId,
          physicalQuantity: item.physicalQuantity,
          reason: item.reason,
        })),
      });

    setConfirmedReconciliation(result);
    setReview(null);

    const balances =
      await loadDriverExpectedInventoryAction(
        review.driverId,
      );

    setExpected(balances);

    setCounts(
      Object.fromEntries(
        products.map((product) => [
          product.id,
          {
            physicalQuantity: "",
            reason: "",
          },
        ]),
      ),
    );

    setNotes("");
  } catch (confirmError) {
    setError(
      confirmError instanceof Error
        ? confirmError.message
        : "Unable to confirm inventory reconciliation.",
    );
  } finally {
    setConfirming(false);
  }
}

  if (confirmedReconciliation) {
    return (
      <ReconciliationReview
        reconciliation={confirmedReconciliation}
        confirming={false}
        error={error}
      />
    );
  }

  if (review) {
    return (
      <ReconciliationPreview
        review={review}
        confirming={confirming}
        error={error}
        onBack={() => {
          setReview(null);
          setError(null);
        }}
        onConfirm={() => {
          void handleConfirm();
        }}
      />
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="grid gap-6"
    >
      <section className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm sm:p-6">
        <div className="max-w-xl">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-espresso-950">
              Driver
            </span>

            <select
              value={driverId}
              disabled={loading}
              onChange={(event) => {
                void handleDriverChange(event.target.value);
              }}
              className={inputClass}
            >
              <option value="">Select driver</option>

              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name}
                  {driver.email
                    ? ` — ${driver.email}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loading && (
        <div className="rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
          Calculating expected inventory…
        </div>
      )}

      {driverId && !loading && (
        <>
          <section className="overflow-hidden rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
            <div className="border-b border-latte-200 px-5 py-4 sm:px-6">
              <h2 className="font-semibold text-espresso-950">
                Physical count
              </h2>

              <p className="mt-1 text-sm text-steam-400">
                Enter the inventory physically present in
                the driver&apos;s van.
              </p>
            </div>

            <div className="divide-y divide-latte-200">
              {products.map((product) => {
                const balance =
                  expectedByProductId.get(product.id);

                const count = counts[product.id];

                const physical =
                  count?.physicalQuantity.trim()
                    ? Number(count.physicalQuantity)
                    : null;

                const variance =
                  physical !== null &&
                  Number.isFinite(physical) &&
                  balance?.expectedQuantity !== null &&
                  balance?.expectedQuantity !== undefined
                    ? physical -
                      balance.expectedQuantity
                    : null;

                return (
                  <div
                    key={product.id}
                    className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(220px,1.5fr)_140px_180px_140px_minmax(220px,1fr)] lg:items-start"
                  >
                    <div>
                      <div className="font-medium text-espresso-950">
                        {product.name}
                      </div>

                      <div className="mt-1 text-xs text-steam-400">
                        {product.sku
                          ? `SKU ${product.sku} · `
                          : ""}
                        {product.package_description ??
                          product.base_unit}
                      </div>
                    </div>

                    <Metric
                      label="Expected"
                      value={
                        balance?.hasBaseline
                          ? formatQuantity(
                              balance.expectedQuantity,
                              balance.normalizedUnit,
                            )
                          : "No baseline"
                      }
                    />

                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-steam-400">
                        Physical
                      </span>

                      <input
                        type="number"
                        min="0"
                        step={
                          product.allows_partial_base_unit
                            ? "any"
                            : "1"
                        }
                        value={
                          count?.physicalQuantity ?? ""
                        }
                        onChange={(event) =>
                          updateCount(product.id, {
                            physicalQuantity:
                              event.target.value,
                          })
                        }
                        placeholder="Count"
                        className={inputClass}
                      />

                      <span className="text-xs text-steam-400">
                        {product.base_unit}
                      </span>
                    </label>

                    <Metric
                      label="Variance"
                      value={
                        variance === null
                          ? "—"
                          : `${formatSigned(variance)} ${
                              balance?.normalizedUnit ??
                              product.base_unit
                            }`
                      }
                      emphasis={
                        variance === null
                          ? "neutral"
                          : variance === 0
                            ? "success"
                            : "warning"
                      }
                    />

                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-steam-400">
                        Reason
                      </span>

                      <input
                        value={count?.reason ?? ""}
                        onChange={(event) =>
                          updateCount(product.id, {
                            reason: event.target.value,
                          })
                        }
                        placeholder="Optional note"
                        className={inputClass}
                      />
                    </label>

                    {!balance?.hasBaseline && (
                      <div className="lg:col-span-5 rounded-xl border border-copper-200 bg-copper-50 px-4 py-3 text-sm text-espresso-800">
                        No trusted baseline exists for this
                        product. The physical count will
                        establish the initial baseline, so no
                        variance will be calculated.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm sm:p-6">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-espresso-950">
                Reconciliation notes
              </span>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                rows={3}
                placeholder="Optional notes about this physical count"
                className={inputClass}
              />
            </label>
          </section>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-copper-500 px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              Review reconciliation
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function ReconciliationPreview({
  review,
  confirming,
  error,
  onBack,
  onConfirm,
}: {
  review: ReconciliationReviewState;
  confirming: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
      <div className="border-b border-latte-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-espresso-950">
              Review reconciliation
            </h2>

            <p className="mt-1 text-sm text-steam-400">
              Review the expected balance, physical count, and
              variance before confirming.
            </p>
          </div>

          <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-espresso-800">
            Review
          </span>
        </div>
      </div>

      <div className="divide-y divide-latte-200">
        {review.items.map((item) => (
          <div
            key={item.productId}
            className="grid gap-4 p-5 sm:p-6 md:grid-cols-4"
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
                item.expectedQuantity === null
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
                item.varianceQuantity === null
                  ? "—"
                  : `${formatSigned(
                      item.varianceQuantity,
                    )} ${item.normalizedUnit}`
              }
              emphasis={
                item.varianceQuantity === null
                  ? "neutral"
                  : item.varianceQuantity === 0
                    ? "success"
                    : "warning"
              }
            />

            {item.reason && (
              <div className="text-sm text-steam-400 md:col-span-4">
                <span className="font-medium text-espresso-800">
                  Reason:
                </span>{" "}
                {item.reason}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mx-6">
          {error}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3 border-t border-latte-200 p-5 sm:p-6">
        <button
          type="button"
          disabled={confirming}
          onClick={onBack}
          className="rounded-xl border border-latte-200 px-5 py-3 text-sm font-medium text-espresso-950 transition hover:bg-latte-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back to edit
        </button>

        <button
          type="button"
          disabled={confirming}
          onClick={onConfirm}
          className="rounded-xl bg-copper-500 px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {confirming
            ? "Confirming…"
            : "Confirm reconciliation"}
        </button>
      </div>
    </section>
  );
}

function ReconciliationReview({
  reconciliation,
  confirming,
  error,
  onConfirm,
}: {
  reconciliation: InventoryReconciliationDetail;
  confirming: boolean;
  error: string | null;
  onConfirm?: () => void;
}) {
  const confirmed =
    reconciliation.status === "confirmed";

  return (
    <section className="rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
      <div className="border-b border-latte-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-espresso-950">
              {confirmed
                ? "Reconciliation confirmed"
                : "Review reconciliation"}
            </h2>

            <p className="mt-1 text-sm text-steam-400">
              {confirmed
                ? "This physical count is now the trusted inventory baseline."
                : "Review the expected balance, physical count, and variance before confirming."}
            </p>
          </div>

          <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-espresso-800">
            {reconciliation.status}
          </span>
        </div>
      </div>

      <div className="divide-y divide-latte-200">
        {reconciliation.items.map((item) => (
          <div
            key={item.id}
            className="grid gap-4 p-5 sm:p-6 md:grid-cols-4"
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
                item.expectedQuantity === null
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
                item.varianceQuantity === null
                  ? "—"
                  : `${formatSigned(
                      item.varianceQuantity,
                    )} ${item.normalizedUnit}`
              }
              emphasis={
                item.varianceQuantity === null
                  ? "neutral"
                  : item.varianceQuantity === 0
                    ? "success"
                    : "warning"
              }
            />

            {item.reason && (
              <div className="md:col-span-4 text-sm text-steam-400">
                <span className="font-medium text-espresso-800">
                  Reason:
                </span>{" "}
                {item.reason}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mx-6">
          {error}
        </div>
      )}

      {!confirmed && onConfirm && (
        <div className="flex justify-end border-t border-latte-200 p-5 sm:p-6">
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className="rounded-xl bg-copper-500 px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming
              ? "Confirming…"
              : "Confirm reconciliation"}
          </button>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  emphasis = "neutral",
}: {
  label: string;
  value: string;
  emphasis?: "neutral" | "success" | "warning";
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

      <div className={`mt-2 text-sm font-semibold ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function formatQuantity(
  quantity: number | null,
  unit: string,
) {
  if (quantity === null) {
    return "—";
  }

  return `${quantity.toLocaleString()} ${unit}`;
}

function formatSigned(quantity: number) {
  if (quantity > 0) {
    return `+${quantity.toLocaleString()}`;
  }

  return quantity.toLocaleString();
}