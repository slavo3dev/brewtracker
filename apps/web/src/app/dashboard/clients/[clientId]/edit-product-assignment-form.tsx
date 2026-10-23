"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ClientInventoryAssignment } from "@/lib/clients/client-service";

import { updateClientProduct } from "../client-product-actions";

type Props = {
  clientId: string;
  assignment: ClientInventoryAssignment;
  onCancel: () => void;
};

export function EditProductAssignmentForm({
  clientId,
  assignment,
  onCancel,
}: Props) {
  const router = useRouter();

  const [parLevel, setParLevel] = useState(
    assignment.par_level === null ? "" : String(assignment.par_level),
  );

  const [isRequired, setIsRequired] = useState(assignment.is_required);

  const [displayOrder, setDisplayOrder] = useState(
    String(assignment.display_order),
  );

  const [isActive, setIsActive] = useState(assignment.is_active);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedParLevel = parLevel.trim() === "" ? null : Number(parLevel);

    const parsedDisplayOrder = Number(displayOrder);

    if (
      parsedParLevel !== null &&
      (!Number.isFinite(parsedParLevel) || parsedParLevel < 0)
    ) {
      setError("Par level must be a non-negative number.");
      return;
    }

    if (
      displayOrder.trim() === "" ||
      !Number.isSafeInteger(parsedDisplayOrder) ||
      parsedDisplayOrder < 0
    ) {
      setError("Display order must be a non-negative integer.");
      return;
    }

    startTransition(async () => {
      try {
        await updateClientProduct({
          assignmentId: assignment.id,
          clientId,
          parLevel: parsedParLevel,
          isRequired,
          displayOrder: parsedDisplayOrder,
          isActive,
        });

        router.refresh();
        onCancel();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to update assignment.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-4 border-t border-latte-200 pt-4"
    >
      <div>
        <label
          htmlFor={`par-level-${assignment.id}`}
          className="mb-1 block text-sm font-medium text-espresso-950"
        >
          Par Level (base units)
        </label>

        <input
          id={`par-level-${assignment.id}`}
          type="number"
          min="0"
          step="any"
          value={parLevel}
          onChange={(event) => setParLevel(event.target.value)}
          disabled={isPending}
          className="w-full rounded-xl border border-latte-200 px-4 py-2.5 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor={`display-order-${assignment.id}`}
          className="mb-1 block text-sm font-medium text-espresso-950"
        >
          Display Order
        </label>

        <input
          id={`display-order-${assignment.id}`}
          type="number"
          min="0"
          step="1"
          required
          value={displayOrder}
          onChange={(event) => setDisplayOrder(event.target.value)}
          disabled={isPending}
          className="w-full rounded-xl border border-latte-200 px-4 py-2.5 text-sm"
        />
      </div>

      <label className="flex items-center gap-3 text-sm text-espresso-950">
        <input
          type="checkbox"
          checked={isRequired}
          onChange={(event) => setIsRequired(event.target.checked)}
          disabled={isPending}
        />
        Required product
      </label>

      <label className="flex items-center gap-3 text-sm text-espresso-950">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          disabled={isPending}
        />
        Active assignment
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-copper-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-xl border border-latte-200 px-5 py-2.5 text-sm font-medium text-espresso-950"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
