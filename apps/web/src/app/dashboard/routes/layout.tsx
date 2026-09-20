import type { ReactNode } from "react";

import { requireRouteManager } from "@/lib/auth/require-route-manager";

import { RouteManagementNavigation } from "./route-management-navigation";

type Props = {
  children: ReactNode;
};

export default async function RoutesLayout({ children }: Props) {
  await requireRouteManager();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-copper-600">Route Management</p>

        <h1 className="mt-1 text-display text-3xl text-espresso-950">Routes</h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-steam-400">
          Manage today's operational routes and configure recurring schedules
          for automatic route generation.
        </p>

        <div className="mt-6">
          <RouteManagementNavigation />
        </div>
      </header>

      {children}
    </main>
  );
}
