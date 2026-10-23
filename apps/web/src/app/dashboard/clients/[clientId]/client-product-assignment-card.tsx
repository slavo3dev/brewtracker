"use client";

import { useState } from "react";

import type { ClientInventoryAssignment } from "@/lib/clients/client-service";

import { EditProductAssignmentForm } from "./edit-product-assignment-form";

type Props = {
  clientId: string;
  assignment: ClientInventoryAssignment;
};

export function ClientProductAssignmentCard({ clientId, assignment }: Props) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-espresso-950">
            {assignment.product.name}
          </h3>

          <p className="mt-1 text-sm text-steam-400">
            SKU: {assignment.product.sku ?? "Not assigned"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-latte-100 px-3 py-1 text-xs text-espresso-800">
            {assignment.is_active ? "Active" : "Inactive"}
          </span>

          <button
            type="button"
            onClick={() => setIsEditing((previous) => !previous)}
            className="text-sm font-medium text-copper-600 hover:underline"
          >
            {isEditing ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-latte-200 pt-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-steam-400">Par level</p>
          <p className="font-medium text-espresso-950">
            {assignment.par_level ?? "Not configured"}
          </p>
        </div>

        <div>
          <p className="text-xs text-steam-400">Required</p>
          <p className="font-medium text-espresso-950">
            {assignment.is_required ? "Yes" : "No"}
          </p>
        </div>

        <div>
          <p className="text-xs text-steam-400">Display order</p>
          <p className="font-medium text-espresso-950">
            {assignment.display_order}
          </p>
        </div>
      </div>

      {isEditing && (
        <EditProductAssignmentForm
          clientId={clientId}
          assignment={assignment}
          onCancel={() => setIsEditing(false)}
        />
      )}
    </article>
  );
}
