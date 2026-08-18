"use client";

import { useEffect, useMemo, useState } from "react";
import type { Database } from "@brewtracker/types";
import { PlusIcon, SearchIcon, XIcon } from "@/components/ui/icons";
import { AddUserForm } from "./add-user-form";
import { UserCard } from "./user-card";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type Props = { users: UserRow[] };
const PAGE_SIZE = 10;
const inputClass = "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function UserManagement({ users }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [page, setPage] = useState(1);

  const regions = useMemo(() => [...new Set(users.map((user) => user.region).filter((value): value is string => Boolean(value)))].sort(), [users]);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const searchableText = [user.full_name, user.email, user.phone, user.address, user.region].filter(Boolean).join(" ").toLowerCase();
      return (!query || searchableText.includes(query)) && (!role || user.role === role) && (!status || String(user.is_active) === status) && (!region || user.region === region);
    });
  }, [region, role, search, status, users]);

  useEffect(() => setPage(1), [search, role, status, region]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const visibleUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(search || role || status || region);

  function clearFilters() { setSearch(""); setRole(""); setStatus(""); setRegion(""); }

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-display text-3xl text-espresso-950">User management</h1><p className="mt-2 text-sm text-steam-400">Add users, update roles, and manage account access.</p></div>
        <button type="button" onClick={() => setShowAddForm((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-full bg-espresso-950 px-5 py-2.5 text-sm font-medium text-crema-50 transition-colors hover:bg-copper-600">
          {showAddForm ? <XIcon className="size-4" /> : <PlusIcon className="size-4" />}{showAddForm ? "Close" : "Add user"}
        </button>
      </div>

      {showAddForm && <section className="mb-8 rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm"><h2 className="mb-5 text-lg font-semibold text-espresso-950">Add user</h2><AddUserForm /></section>}

      <section>
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-lg font-semibold text-espresso-950">Users</h2><p className="text-sm text-steam-400">Showing {filteredUsers.length} of {users.length} users</p></div>
          {hasFilters && <button type="button" onClick={clearFilters} className="text-left text-sm font-medium text-copper-600 hover:underline">Clear filters</button>}
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl border border-latte-200 bg-crema-0 p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <label className="relative"><span className="sr-only">Search users</span><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steam-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className={`${inputClass} pl-9`} /></label>
          <select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)} className={inputClass}><option value="">All roles</option><option value="driver">Driver</option><option value="tech">Tech</option><option value="manager">Manager</option><option value="ceo">CEO</option></select>
          <select aria-label="Filter by account status" value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select>
          <select aria-label="Filter by region" value={region} onChange={(event) => setRegion(event.target.value)} className={inputClass}><option value="">All regions</option>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>

        {visibleUsers.length === 0 ? <div className="rounded-2xl border border-dashed border-latte-200 bg-crema-0 p-8 text-center text-sm text-steam-400">No users match the selected filters.</div> : <div className="grid gap-4">{visibleUsers.map((user) => <UserCard key={user.id} user={user} />)}</div>}

        {totalPages > 1 && <nav aria-label="User pagination" className="mt-6 flex items-center justify-between gap-4"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-full border border-latte-200 px-4 py-2 text-sm font-medium text-espresso-800 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><p className="text-sm text-steam-400">Page {page} of {totalPages}</p><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-full border border-latte-200 px-4 py-2 text-sm font-medium text-espresso-800 disabled:cursor-not-allowed disabled:opacity-40">Next</button></nav>}
      </section>
    </>
  );
}