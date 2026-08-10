"use client";

import type { FleetLocation } from "@/lib/fleet/fleet-service";
import { createClient } from "@/lib/supabase/client";
import L from "leaflet";
import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

type Props = {
  initialLocations: FleetLocation[];
};

type MappableFleetLocation = FleetLocation & {
  driver_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
};

function isMappableLocation(
  location: FleetLocation,
): location is MappableFleetLocation {
  return (
    location.driver_id !== null &&
    location.latitude !== null &&
    location.longitude !== null &&
    location.recorded_at !== null
  );
}

const FLEET_REFRESH_INTERVAL_MS = 60_000;
const FLEET_REFRESH_DEBOUNCE_MS = 1_000;

const driverIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export function FleetMap({ initialLocations }: Props) {
  const [locations, setLocations] = useState<FleetLocation[]>(initialLocations);

  const refreshTimeoutRef = useRef<number | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const refreshLocations = useCallback(async (): Promise<void> => {
    const { data, error } = await supabase
      .from("active_fleet_locations")
      .select("*")
      .order("recorded_at", {
        ascending: false,
      });

    if (error) {
      console.error("Unable to refresh fleet locations:", error.message);
      return;
    }

    setLocations(data ?? []);
  }, [supabase]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      void refreshLocations();
    }, FLEET_REFRESH_DEBOUNCE_MS);
  }, [refreshLocations]);

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
        () => {
          scheduleRefresh();
        },
      )
      .subscribe();

    const refreshInterval = window.setInterval(() => {
      void refreshLocations();
    }, FLEET_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(refreshInterval);

      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [refreshLocations, scheduleRefresh, supabase]);

  const mappableLocations = useMemo(
    () => locations.filter(isMappableLocation),
    [locations],
  );

  const DEFAULT_MAP_CENTER: [number, number] = [44.65803, 20.936333];

  const center: [number, number] = mappableLocations[0]
    ? [mappableLocations[0].latitude, mappableLocations[0].longitude]
    : DEFAULT_MAP_CENTER;

  return (
    <div className="overflow-hidden rounded-2xl border border-latte-200 bg-crema-0 shadow-sm">
      {locations.length === 0 ? (
        <div className="border-b border-latte-200 p-4 text-sm text-steam-400">
          No clocked-in drivers have sent a location in the last 10 minutes.
        </div>
      ) : null}

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

        {mappableLocations.map((location) => (
          <Marker
            key={location.driver_id}
            position={[location.latitude, location.longitude]}
            icon={driverIcon}
          >
            <Popup>
              <div>
                <strong>{location.driver_full_name ?? "Unknown driver"}</strong>
                <br />
                {location.driver_email ?? "No email"}
                <br />
                Region: {location.driver_region ?? "—"}
                <br />
                Route: {location.route_date ?? "—"}
                <br />
                Route status: {location.route_status ?? "—"}
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
