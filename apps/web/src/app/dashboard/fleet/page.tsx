import { canAccessAdminApp } from "@brewtracker/types";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/get-current-user";
import { getLatestFleetLocations } from "@/lib/fleet/fleet-service";
import { FleetMapLoader } from "./fleet-map-loader";

export default async function FleetPage() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!canAccessAdminApp(profile)) {
    redirect("/dashboard");
  }

  const locations = await getLatestFleetLocations();

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-display text-3xl text-espresso-950">
          Live Fleet Map
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          Realtime view of active drivers and vans based on mobile GPS pings.
        </p>
      </header>

      {locations.length === 0 ? (
        <section className="rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
          No live driver locations yet. Driver phones need to send location
          pings first.
        </section>
      ) : (
        <FleetMapLoader initialLocations={locations} />
      )}
    </main>
  );
}
