"use client";

import { useActionState } from "react";
import { UserPlusIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { createUser } from "./actions";
import { initialUserActionState } from "./action-state";

const inputClass = "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function AddUserForm() {
  const [state, formAction] = useActionState(createUser, initialUserActionState);
  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Full name<input name="fullName" required placeholder="Full name" className={inputClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Email<input name="email" required type="email" placeholder="user@example.com" className={inputClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Phone<input name="phone" placeholder="+381641234567" className={inputClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Address<input name="address" placeholder="Address" className={inputClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Region<input name="region" placeholder="Region" className={inputClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Role<select name="role" defaultValue="driver" className={inputClass}><option value="driver">Driver</option><option value="tech">Tech</option><option value="manager">Manager</option><option value="ceo">CEO</option></select></label>
      {state.error && <p role="alert" className="rounded-lg bg-copper-100 px-3 py-2 text-sm text-copper-600 md:col-span-2">{state.error}</p>}
      {state.success && <p role="status" className="rounded-lg bg-latte-100 px-3 py-2 text-sm text-espresso-800 md:col-span-2">{state.success}</p>}
      <div className="md:col-span-2 md:flex md:justify-end"><SubmitButton pendingLabel="Creating user…" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-espresso-950 px-5 py-2.5 text-sm font-medium text-crema-50 hover:bg-copper-600 disabled:opacity-50 md:w-auto"><UserPlusIcon className="size-4" />Create user and send setup email</SubmitButton></div>
    </form>
  );
}