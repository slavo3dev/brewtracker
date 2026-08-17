"use client";

import { useEffect, useMemo, useState } from "react";
import type { Database } from "@brewtracker/types";
import type { RouteBuilderRoute } from "@/lib/routes/route-service";
import { CreateRouteForm } from "./create-route-form";
import { PlusIcon, SearchIcon, XIcon } from "./icons";
import { RouteCard } from "./route-card";

type Driver = Pick<Database["public"]["Tables"]["users"]["Row"], "id" | "full_name" | "email" | "region">;
type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
type Client = Database["public"]["Tables"]["clients"]["Row"];
type Machine = Database["public"]["Tables"]["machines"]["Row"];

type Props = {
  routes: RouteBuilderRoute[];
  drivers: Driver[];
  warehouses: Warehouse[];
  clients: Client[];
  machines: Machine[];
};

const PAGE_SIZE = 10;
const inputClass = "w-full rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function RouteBuilder({ routes, drivers, warehouses, clients, machines }: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [search, setSearch] = useState("");
  const [driverId, setDriverId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [status, setStatus] = useState("");
  const [routeDate, setRouteDate] = useState("");
  const [page, setPage] = useState(1);

  const statuses = useMemo(
    () => [...new Set(routes.map((route) => route.status))].sort(),
    [routes],
  );

  const filteredRoutes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return routes.filter((route) => {
      const searchableText = [route.driver?.full_name, route.driver?.email, route.warehouse?.name, route.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchableText.includes(query)) &&
        (!driverId || route.driver_id === driverId) &&
        (!warehouseId || route.warehouse_id === warehouseId) &&
        (!status || route.status === status) &&
        (!routeDate || route.route_date === routeDate)
      );
    });
  }, [driverId, routeDate, routes, search, status, warehouseId]);

  useEffect(() => setPage(1), [search, driverId, warehouseId, status, routeDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / PAGE_SIZE));
  const visibleRoutes = filteredRoutes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(search || driverId || warehouseId || status || routeDate);

  function clearFilters() {
    setSearch("");
    setDriverId("");
    setWarehouseId("");
    setStatus("");
    setRouteDate("");
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-display text-3xl text-espresso-950">Route Builder</h1>
          <p className="mt-2 text-sm text-steam-400">Assign drivers, create daily routes, add stops, and preview directions.</p>
        </div>
        <button type="button" onClick={() => setShowCreateForm((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-full bg-espresso-950 px-5 py-2.5 text-sm font-medium text-crema-50 transition-colors hover:bg-copper-600">
          {showCreateForm ? <XIcon className="size-4" /> : <PlusIcon className="size-4" />}
          {showCreateForm ? "Close" : "Create route"}
        </button>
      </div>

      {showCreateForm && (
        <section className="mb-8 rounded-2xl border border-latte-200 bg-crema-0 p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold text-espresso-950">Create route</h2>
          <CreateRouteForm drivers={drivers} warehouses={warehouses} />
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-lg font-semibold text-espresso-950">Routes</h2><p className="text-sm text-steam-400">Showing {filteredRoutes.length} of {routes.length} routes</p></div>
          {hasFilters && <button type="button" onClick={clearFilters} className="text-left text-sm font-medium text-copper-600 hover:underline">Clear filters</button>}
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl border border-latte-200 bg-crema-0 p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
          <label className="relative xl:col-span-1"><span className="sr-only">Search routes</span><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steam-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search routes" className={`${inputClass} pl-9`} /></label>
          <select aria-label="Filter by driver" value={driverId} onChange={(event) => setDriverId(event.target.value)} className={inputClass}><option value="">All drivers</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name}</option>)}</select>
          <select aria-label="Filter by warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className={inputClass}><option value="">All warehouses</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="">All statuses</option>{statuses.map((routeStatus) => <option key={routeStatus} value={routeStatus}>{routeStatus}</option>)}</select>
          <input aria-label="Filter by route date" type="date" value={routeDate} onChange={(event) => setRouteDate(event.target.value)} className={inputClass} />
        </div>

        {visibleRoutes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-latte-200 bg-crema-0 p-8 text-center text-sm text-steam-400">No routes match the selected filters.</div>
        ) : (
          <div className="grid gap-4">{visibleRoutes.map((route) => <RouteCard key={route.id} route={route} clients={clients} machines={machines} />)}</div>
        )}

        {totalPages > 1 && (
          <nav aria-label="Route pagination" className="mt-6 flex items-center justify-between gap-4">
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-full border border-latte-200 px-4 py-2 text-sm font-medium text-espresso-800 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <p className="text-sm text-steam-400">Page {page} of {totalPages}</p>
            <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-full border border-latte-200 px-4 py-2 text-sm font-medium text-espresso-800 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </nav>
        )}
      </section>
    </>
  );
}