"use client";

import { useActionState } from "react";
import { createUser } from "./actions";
import { initialUserActionState } from "./action-state";

const inputClass =
  "rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function AddUserForm() {
  const [state, formAction] = useActionState(
    createUser,
    initialUserActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input
        name="fullName"
        required
        placeholder="Full name"
        className={inputClass}
      />

      <input
        name="email"
        required
        type="email"
        placeholder="Email"
        className={inputClass}
      />

      <input name="phone" placeholder="Phone" className={inputClass} />

      <input name="address" placeholder="Address" className={inputClass} />

      <input name="region" placeholder="Region" className={inputClass} />

      <select name="role" defaultValue="driver" className={inputClass}>
        <option value="driver">Driver</option>
        <option value="tech">Tech</option>
        <option value="manager">Manager</option>
        <option value="ceo">CEO</option>
      </select>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-copper-100 px-3 py-2 text-sm text-copper-600 md:col-span-2"
        >
          {state.error}
        </p>
      )}

      {state.success && (
        <p
          role="status"
          className="rounded-lg bg-latte-100 px-3 py-2 text-sm text-espresso-800 md:col-span-2"
        >
          {state.success}
        </p>
      )}

      <button
        type="submit"
        className="rounded-full bg-espresso-950 px-4 py-2 text-sm font-medium text-crema-50 transition-colors hover:bg-copper-600 md:col-span-2"
      >
        Create user and send password setup
      </button>
    </form>
  );
}
