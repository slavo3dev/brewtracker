"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { assignClientProduct } from "../client-product-actions";

import type { EligibleClientProduct } from "@/lib/clients/client-service";

type Props = {
  clientId: string;
  products: EligibleClientProduct[];
};

export function AssignProductForm({ clientId, products }: Props) {
  const router = useRouter();

  const [productId, setProductId] = useState("");
  const [parLevel, setParLevel] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!productId) {
      setError("Please select a product.");
      return;
    }

    const parsedParLevel = parLevel.trim() === "" ? null : Number(parLevel);

    if (
      parsedParLevel === null ||
      !Number.isFinite(parsedParLevel) ||
      parsedParLevel < 0
    ) {
      setError("Enter a non-negative par level.");
      return;
    }

    startTransition(async () => {
      try {
        await assignClientProduct({
          clientId,
          productId,
          parLevel: parsedParLevel,
          isRequired,
        });

        setProductId("");
        setParLevel("");
        setIsRequired(true);

        router.refresh();
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Unable to assign product.",
        );
      }
    });
  }

  if (products.length === 0) {
    return (
      <p className="text-sm text-steam-400">
        No additional eligible products are available.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-latte-200 bg-crema-0 p-5"
    >
      <h3 className="font-semibold text-espresso-950">
        Assign Inventory Product
      </h3>

      <div>
        <label
          htmlFor="productId"
          className="mb-1 block text-sm font-medium text-espresso-950"
        >
          Product
        </label>

        <select
          id="productId"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          required
          disabled={isPending}
          className="w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm"
        >
          <option value="">Select product...</option>

          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.sku ? ` (${product.sku})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="parLevel"
          className="mb-1 block text-sm font-medium text-espresso-950"
        >
          Par Level (base units)
        </label>

        <input
          id="parLevel"
          type="number"
          min="0"
          step="any"
          required
          value={parLevel}
          onChange={(event) => setParLevel(event.target.value)}
          disabled={isPending}
          placeholder="Required"
          className="w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm"
        />
      </div>

      <label className="flex items-center gap-3 text-sm text-espresso-950">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(event) => setIsRequired(event.target.checked)}
          disabled={isPending}
        />
        Required product for this client
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !productId}
        className="rounded-xl bg-copper-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Assigning..." : "Assign Product"}
      </button>
    </form>
  );
}
