"use client";

import type { Database } from "@brewtracker/types";
import { useActionState } from "react";
import { sendPasswordReset, updateUser, updateUserStatus } from "./actions";
import { initialUserActionState } from "./action-state";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

const inputClass =
  "rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

type UserCardProps = {
  user: UserRow;
};

export function UserCard({ user }: UserCardProps) {
  const [updateState, updateAction] = useActionState(
    updateUser,
    initialUserActionState,
  );

  const [statusState, statusAction] = useActionState(
    updateUserStatus,
    initialUserActionState,
  );

  const [resetState, resetAction] = useActionState(
    sendPasswordReset,
    initialUserActionState,
  );

  const feedback =
    updateState.error ||
    updateState.success ||
    statusState.error ||
    statusState.success ||
    resetState.error ||
    resetState.success;

  const hasError = updateState.error || statusState.error || resetState.error;

  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-espresso-950">{user.full_name}</h3>
          <p className="text-sm text-steam-400">{user.email}</p>
          <p className="mt-1 text-sm text-steam-400">
            {user.role} • {user.is_active ? "Active" : "Inactive"}
          </p>
        </div>

        <span className="rounded-full bg-latte-100 px-3 py-1 text-xs font-medium text-espresso-800">
          {user.region || "No region"}
        </span>
      </div>

      <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-steam-400">Address</dt>
          <dd className="text-espresso-950">{user.address || "—"}</dd>
        </div>

        <div>
          <dt className="text-steam-400">Phone</dt>
          <dd className="text-espresso-950">{user.phone || "—"}</dd>
        </div>

        <div>
          <dt className="text-steam-400">Role</dt>
          <dd className="capitalize text-espresso-950">{user.role}</dd>
        </div>
      </dl>

      {feedback && (
        <p
          role={hasError ? "alert" : "status"}
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            hasError
              ? "bg-copper-100 text-copper-600"
              : "bg-latte-100 text-espresso-800"
          }`}
        >
          {feedback}
        </p>
      )}

      <form action={updateAction} className="grid gap-3 md:grid-cols-5">
        <input type="hidden" name="userId" value={user.id} />

        <input
          name="fullName"
          defaultValue={user.full_name}
          placeholder="Full name"
          className={inputClass}
        />

        <input
          name="phone"
          defaultValue={user.phone ?? ""}
          placeholder="Phone"
          className={inputClass}
        />

        <input
          name="address"
          defaultValue={user.address ?? ""}
          placeholder="Address"
          className={inputClass}
        />

        <input
          name="region"
          defaultValue={user.region ?? ""}
          placeholder="Region"
          className={inputClass}
        />

        <select name="role" defaultValue={user.role} className={inputClass}>
          <option value="driver">Driver</option>
          <option value="tech">Tech</option>
          <option value="manager">Manager</option>
          <option value="ceo">CEO</option>
        </select>

        <button className="rounded-full bg-latte-100 px-3 py-2 text-sm font-medium text-espresso-800 transition-colors hover:bg-copper-100 md:col-span-5">
          Save changes
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={statusAction}>
          <input type="hidden" name="userId" value={user.id} />
          <input
            type="hidden"
            name="isActive"
            value={String(!user.is_active)}
          />

          <button className="rounded-full bg-latte-100 px-3 py-2 text-sm font-medium text-espresso-800 transition-colors hover:bg-copper-100">
            {user.is_active ? "Deactivate" : "Activate"}
          </button>
        </form>

        <form action={resetAction}>
          <input type="hidden" name="email" value={user.email ?? ""} />

          <button className="rounded-full bg-espresso-950 px-3 py-2 text-sm font-medium text-crema-50 transition-colors hover:bg-copper-600">
            Send password reset
          </button>
        </form>
      </div>
    </article>
  );
}
