"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updatePassword, type UpdatePasswordResult } from "./actions";

const initialState: UpdatePasswordResult = {
  error: null,
};

export default function UpdatePasswordPage() {
  const [state, formAction] = useActionState(updatePassword, initialState);

  return (
    <div className="pour-glow flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-display text-2xl text-espresso-950">
            Set new password
          </h1>
          <p className="mt-1.5 text-[14px] text-steam-400">
            Choose a new password for your BrewTracker account.
          </p>
        </div>

        <form
          action={formAction}
          className="space-y-5 rounded-2xl bg-crema-0 p-7 shadow-[0_2px_8px_rgba(61,43,31,0.07)] ring-1 ring-espresso-950/[0.06]"
        >
          <input
            name="password"
            type="password"
            required
            placeholder="New password"
            className="w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-[15px] text-espresso-950"
          />

          <input
            name="confirmPassword"
            type="password"
            required
            placeholder="Confirm password"
            className="w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-[15px] text-espresso-950"
          />

          {state.error && (
            <p role="alert" className="rounded-lg bg-copper-100 px-3 py-2 text-[13px] text-copper-600">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-espresso-950 px-4 py-2.5 text-[15px] font-medium text-crema-50 transition-colors hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Updating…" : "Update password"}
    </button>
  );
}