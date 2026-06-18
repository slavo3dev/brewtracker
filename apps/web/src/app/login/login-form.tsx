"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type SignInResult } from "./actions";

const initialState: SignInResult = { error: null };

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="redirectTo" value={redirectTo} />

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

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-[13px] font-medium text-espresso-800"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-[15px] text-espresso-950 placeholder:text-steam-300 outline-none transition-colors focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-copper-100 px-3 py-2 text-[13px] text-copper-600"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
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
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
