"use client";

import type { FleetLocation } from "@/lib/fleet/fleet-service";
import { createClient } from "@/lib/supabase/client";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

type Props = {
  initialLocations: FleetLocation[];
};

const driverIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export function FleetMap({ initialLocations }: Props) {
  const [locations, setLocations] = useState<FleetLocation[]>(initialLocations);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel("fleet-location-pings")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "location_pings",
        },
        async () => {
          const { data } = await supabase
            .from("location_pings")
            .select(
              `
              *,
              driver:users!location_pings_driver_id_fkey (
                id,
                full_name,
                email,
                region
              ),
              route:routes (
                id,
                route_date,
                status
              )
            `,
            )
            .order("recorded_at", { ascending: false })
            .limit(200);

          if (!data) return;

          const latestByDriver = new Map<string, FleetLocation>();

          for (const ping of data as FleetLocation[]) {
            if (!latestByDriver.has(ping.driver_id)) {
              latestByDriver.set(ping.driver_id, ping);
            }
          }

          setLocations(Array.from(latestByDriver.values()));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const center = locations[0]
    ? {
        lat: locations[0].latitude,
        lng: locations[0].longitude,
      }
    : {
        lat: 44.8125,
        lng: 20.4612,
      };

  return (
    <div className="overflow-hidden rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom
        className="h-[560px] w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {locations.map((location) => (
          <Marker
            key={`${location.driver_id}-${location.recorded_at}`}
            position={[location.latitude, location.longitude]}
            icon={driverIcon}
          >
            <Popup>
              <div>
                <strong>
                  {location.driver?.full_name ?? "Unknown driver"}
                </strong>
                <br />
                {location.driver?.email ?? "No email"}
                <br />
                Region: {location.driver?.region ?? "—"}
                <br />
                Route: {location.route?.route_date ?? "—"}
                <br />
                Last ping: {new Date(location.recorded_at).toLocaleString()}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
