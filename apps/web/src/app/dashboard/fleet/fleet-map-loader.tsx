"use client";

import dynamic from "next/dynamic";
import type { FleetLocation } from "@/lib/fleet/fleet-service";

const FleetMap = dynamic(
  () => import("./fleet-map").then((module) => module.FleetMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[560px] rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
        Loading fleet map…
      </div>
    ),
  },
);

export function FleetMapLoader({
  initialLocations,
}: {
  initialLocations: FleetLocation[];
}) {
  return <FleetMap initialLocations={initialLocations} />;
}
