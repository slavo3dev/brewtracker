"use client";

import { useActionState, useState } from "react";
import type { Database } from "@brewtracker/types";
import { ChevronDownIcon, MailIcon, SaveIcon, UserCheckIcon, UserXIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { sendPasswordReset, updateUser, updateUserStatus } from "./actions";
import { initialUserActionState } from "./action-state";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type Props = { user: UserRow };
const inputClass = "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function UserCard({ user }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [updateState, updateAction] = useActionState(updateUser, initialUserActionState);
  const [statusState, statusAction] = useActionState(updateUserStatus, initialUserActionState);
  const [resetState, resetAction] = useActionState(sendPasswordReset, initialUserActionState);
  const feedback = updateState.error || updateState.success || statusState.error || statusState.success || resetState.error || resetState.success;
  const hasError = Boolean(updateState.error || statusState.error || resetState.error);

  return (
    <article className="overflow-hidden rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setIsExpanded((value) => !value)} aria-expanded={isExpanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-espresso-950 text-sm font-semibold uppercase text-crema-50">{getInitials(user.full_name)}</span>
          <span className="min-w-0"><span className="block truncate font-semibold text-espresso-950">{user.full_name}</span><span className="block truncate text-sm text-steam-400">{user.email}</span><span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs capitalize text-steam-400"><span>{user.role}</span><span>{user.region || "No region"}</span></span></span>
        </button>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${user.is_active ? "bg-latte-100 text-espresso-800" : "bg-copper-100 text-copper-600"}`}>{user.is_active ? "Active" : "Inactive"}</span>
          <button type="button" onClick={() => setIsExpanded((value) => !value)} className="inline-flex items-center gap-2 rounded-full border border-latte-200 px-4 py-2 text-sm font-medium text-espresso-800 hover:bg-latte-100">{isExpanded ? "Hide details" : "View / manage"}<ChevronDownIcon className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} /></button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-latte-200 bg-latte-100/40 p-5">
          {feedback && <p role={hasError ? "alert" : "status"} className={`mb-4 rounded-lg px-3 py-2 text-sm ${hasError ? "bg-copper-100 text-copper-600" : "bg-latte-100 text-espresso-800"}`}>{feedback}</p>}
          <h4 className="font-semibold text-espresso-950">Personal information</h4>
          <form action={updateAction} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input type="hidden" name="userId" value={user.id} />
            <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Full name<input name="fullName" required defaultValue={user.full_name} className={inputClass} /></label>
            <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Phone<input name="phone" defaultValue={user.phone ?? ""} placeholder="+381641234567" className={inputClass} /></label>
            <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Address<input name="address" defaultValue={user.address ?? ""} className={inputClass} /></label>
            <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Region<input name="region" defaultValue={user.region ?? ""} className={inputClass} /></label>
            <label className="grid gap-1.5 text-sm font-medium text-espresso-800">Role<select name="role" defaultValue={user.role} className={inputClass}><option value="driver">Driver</option><option value="tech">Tech</option><option value="manager">Manager</option><option value="ceo">CEO</option></select></label>
            <div className="md:col-span-2 md:flex md:justify-end xl:col-span-5"><SubmitButton pendingLabel="Saving changes…" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-espresso-950 px-5 py-2.5 text-sm font-medium text-crema-50 hover:bg-copper-600 disabled:opacity-50 md:w-auto"><SaveIcon className="size-4" />Save changes</SubmitButton></div>
          </form>

          <div className="mt-6 border-t border-latte-200 pt-5"><h4 className="font-semibold text-espresso-950">Account actions</h4><p className="mt-1 text-sm text-steam-400">Manage access or send a password reset email.</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <form action={resetAction} onSubmit={(event) => { if (!window.confirm(`Send a password reset email to ${user.email}?`)) event.preventDefault(); }}><input type="hidden" name="email" value={user.email ?? ""} /><SubmitButton pendingLabel="Sending email…" disabled={!user.email} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-latte-200 bg-crema-0 px-4 py-2 text-sm font-medium text-espresso-800 hover:bg-latte-100 disabled:opacity-50 sm:w-auto"><MailIcon className="size-4" />Send password reset</SubmitButton></form>
              <form action={statusAction} onSubmit={(event) => { const action = user.is_active ? "Deactivate" : "Activate"; if (!window.confirm(`${action} ${user.full_name}?`)) event.preventDefault(); }}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="isActive" value={String(!user.is_active)} /><SubmitButton pendingLabel={user.is_active ? "Deactivating…" : "Activating…"} className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 sm:w-auto ${user.is_active ? "bg-copper-100 text-copper-600 hover:bg-copper-100/70" : "bg-espresso-950 text-crema-50 hover:bg-copper-600"}`}>{user.is_active ? <UserXIcon className="size-4" /> : <UserCheckIcon className="size-4" />}{user.is_active ? "Deactivate user" : "Activate user"}</SubmitButton></form>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "?";
}