
"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";

import type { ManagedInventoryProduct } from "@/lib/inventory/inventory-product-management-service";

import {
  createInventoryProduct,
  updateInventoryProduct,
  type CreateProductInput,
} from "./product-actions";

type Category = CreateProductInput["category"];
type BusinessType = CreateProductInput["businessTypes"][number];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "coffee", label: "Coffee" },
  { value: "powders", label: "Powders" },
  { value: "sweeteners_stirrers", label: "Sweeteners & Stirrers" },
  { value: "cups_lids", label: "Cups & Lids" },
  { value: "creamers", label: "Creamers" },
  { value: "cleaning", label: "Cleaning" },
];

const INITIAL_FORM: CreateProductInput = {
  name: "",
  sku: null,
  category: "coffee",
  unitLabel: "",
  baseUnit: "",
  issueUnit: "",
  unitsPerIssueUnit: 1,
  packageDescription: null,
  allowsLooseUnits: false,
  allowsPartialBaseUnit: false,
  sortOrder: 0,
  isActive: true,
  businessTypes: ["ocs"],
};

type Props = {
  product?: ManagedInventoryProduct;
  onSaved?: (productId: string) => void;
  onCancel?: () => void;
};

function getInitialForm(
  product?: ManagedInventoryProduct,
): CreateProductInput {
  if (!product) {
    return {
      ...INITIAL_FORM,
      businessTypes: [...INITIAL_FORM.businessTypes],
    };
  }

  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    unitLabel: product.unit_label,
    baseUnit: product.base_unit,
    issueUnit: product.issue_unit,
    unitsPerIssueUnit: Number(product.units_per_issue_unit),
    packageDescription: product.package_description,
    allowsLooseUnits: product.allows_loose_units,
    allowsPartialBaseUnit: product.allows_partial_base_unit,
    sortOrder: product.sort_order,
    isActive: product.is_active,
    businessTypes: [...product.businessTypes],
  };
}

export function InventoryProductForm({
  product,
  onSaved,
  onCancel,
}: Props) {
  const isEditing = Boolean(product);

  const [form, setForm] = useState<CreateProductInput>(
    () => getInitialForm(product),
  );

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CreateProductInput>(
    key: K,
    value: CreateProductInput[K],
  ) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function toggleBusinessType(type: BusinessType) {
    setForm((previous) => ({
      ...previous,
      businessTypes: previous.businessTypes.includes(type)
        ? previous.businessTypes.filter((item) => item !== type)
        : [...previous.businessTypes, type],
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (form.businessTypes.length === 0) {
      setError("Select at least one business type.");
      return;
    }

    startTransition(async () => {
      try {
        const productId = product
          ? await updateInventoryProduct({
              ...form,
              productId: product.id,
            })
          : await createInventoryProduct(form);

        if (!product) {
          setForm(getInitialForm());
        }

        onSaved?.(productId);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : `Unable to ${isEditing ? "update" : "create"} product.`,
        );
      }
    });
  }

  const inputClass =
    "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

  const labelClass = "block space-y-1 text-sm";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm"
    >
      <div>
        <h3 className="text-lg font-semibold">
          {isEditing ? "Edit Product" : "Add Product"}
        </h3>

        <p className="mt-1 text-sm text-steam-400">
          {isEditing
            ? "Update product details, packaging and business availability."
            : "Configure the product, its packaging and business availability."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span>Product name *</span>
          <input
            className={inputClass}
            required
            maxLength={200}
            value={form.name}
            onChange={(event) =>
              update("name", event.target.value)
            }
          />
        </label>

        <label className={labelClass}>
          <span>SKU (optional)</span>
          <input
            className={inputClass}
            value={form.sku ?? ""}
            onChange={(event) =>
              update("sku", event.target.value)
            }
          />
        </label>

        <label className={labelClass}>
          <span>Category *</span>
          <select
            className={inputClass}
            value={form.category}
            onChange={(event) =>
              update("category", event.target.value as Category)
            }
          >
            {CATEGORIES.map((category) => (
              <option
                key={category.value}
                value={category.value}
                className="bg-slate-900"
              >
                {category.label}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          <span>Display unit label *</span>
          <input
            className={inputClass}
            required
            placeholder="e.g. bags"
            value={form.unitLabel}
            onChange={(event) =>
              update("unitLabel", event.target.value)
            }
          />
        </label>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold">Packaging configuration</h4>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className={labelClass}>
            <span>Base unit *</span>
            <input
              className={inputClass}
              required
              placeholder="bag"
              value={form.baseUnit}
              onChange={(event) =>
                update("baseUnit", event.target.value)
              }
            />
          </label>

          <label className={labelClass}>
            <span>Issue unit *</span>
            <input
              className={inputClass}
              required
              placeholder="case"
              value={form.issueUnit}
              onChange={(event) =>
                update("issueUnit", event.target.value)
              }
            />
          </label>

          <label className={labelClass}>
            <span>Base units per issue unit *</span>
            <input
              className={inputClass}
              type="number"
              required
              min={form.allowsPartialBaseUnit ? "0.001" : "1"}
              step={form.allowsPartialBaseUnit ? "0.001" : "1"}
              value={form.unitsPerIssueUnit}
              onChange={(event) =>
                update(
                  "unitsPerIssueUnit",
                  Number(event.target.value),
                )
              }
            />
          </label>
        </div>

        <label className={labelClass}>
          <span>Package description (optional)</span>
          <input
            className={inputClass}
            placeholder="6 × 500g bags"
            value={form.packageDescription ?? ""}
            onChange={(event) =>
              update("packageDescription", event.target.value)
            }
          />
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.allowsLooseUnits}
            onChange={(event) =>
              update("allowsLooseUnits", event.target.checked)
            }
          />
          Allow loose base units
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.allowsPartialBaseUnit}
            onChange={(event) => {
              const allowsPartial = event.target.checked;

              setForm((previous) => ({
                ...previous,
                allowsPartialBaseUnit: allowsPartial,
                unitsPerIssueUnit: allowsPartial
                  ? previous.unitsPerIssueUnit
                  : Math.max(1, Math.ceil(previous.unitsPerIssueUnit)),
              }));
            }}
          />
          Allow fractional base units
        </label>
      </div>

      <div className="space-y-3">
        <h4 className="font-semibold">Business availability *</h4>

        <div className="flex flex-wrap gap-5">
          {(["ocs", "horeca"] as const).map((type) => (
            <label
              key={type}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={form.businessTypes.includes(type)}
                onChange={() => toggleBusinessType(type)}
              />
              {type.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span>Sort order</span>
          <input
            className={inputClass}
            type="number"
            step="1"
            value={form.sortOrder}
            onChange={(event) =>
              update("sortOrder", Number(event.target.value))
            }
          />
        </label>

        <label className="flex items-center gap-3 self-end text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              update("isActive", event.target.checked)
            }
          />
          Product is active
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="rounded-lg border border-latte-200 px-4 py-2 text-sm text-espresso-950"
          >
            Cancel
          </button>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-copper-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
              ? "Save Changes"
              : "Create Product"}
        </button>
      </div>
    </form>
  );
}
