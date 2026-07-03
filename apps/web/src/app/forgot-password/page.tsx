"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordReset,
  type ForgotPasswordResult,
} from "./actions";

const initialState: ForgotPasswordResult = {
  error: null,
  success: null,
};

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <div className="pour-glow flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-display text-2xl text-espresso-950">
            Reset your password
          </h1>
          <p className="mt-1.5 text-[14px] text-steam-400">
            Enter your email and we&apos;ll send reset instructions.
          </p>
        </div>

        <form
          action={formAction}
          className="space-y-5 rounded-2xl bg-crema-0 p-7 shadow-[0_2px_8px_rgba(61,43,31,0.07)] ring-1 ring-espresso-950/[0.06]"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[13px] font-medium text-espresso-800"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@reliant.com"
              className="w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-[15px] text-espresso-950 placeholder:text-steam-300 outline-none transition-colors focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20"
            />
          </div>

          {state.error && (
            <p role="alert" className="rounded-lg bg-copper-100 px-3 py-2 text-[13px] text-copper-600">
              {state.error}
            </p>
          )}

          {state.success && (
            <p className="rounded-lg bg-latte-100 px-3 py-2 text-[13px] text-espresso-800">
              {state.success}
            </p>
          )}

          <SubmitButton />
        </form>

        <p className="mt-6 text-center text-[13px] text-steam-400">
          Remember your password?{" "}
          <Link href="/login" className="font-medium text-espresso-800 hover:text-copper-600">
            Back to sign in
          </Link>
        </p>
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
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}