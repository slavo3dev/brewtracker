import type { RouteBuilderStop } from "@/lib/routes/route-service";
import { MapIcon } from "@/components/ui/icons";

type Props = {
  stops: RouteBuilderStop[];
};

export function RouteMapPreview({ stops }: Props) {
  const stopsWithLocation = stops
    .filter(
      (stop) => stop.client?.latitude != null && stop.client.longitude != null,
    )
    .sort((a, b) => a.sequence_number - b.sequence_number);

  const googleMapsUrl = buildGoogleMapsDirectionsUrl(stopsWithLocation);

  return (
    <div className="rounded-2xl border border-latte-200 bg-latte-100 p-4">
      <p className="text-sm font-medium text-espresso-950">Route map preview</p>

      <p className="mt-1 text-sm text-steam-400">
        {stopsWithLocation.length > 1
          ? `${stopsWithLocation.length} mapped stops available.`
          : "Add at least two stops with client coordinates to preview directions."}
      </p>

      {googleMapsUrl && (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-espresso-950 px-4 py-2 text-sm font-medium text-crema-50 transition-colors hover:bg-copper-600"
        >
          <MapIcon className="size-4" />
          Open in Google Maps
        </a>
      )}
    </div>
  );
}

function buildGoogleMapsDirectionsUrl(stops: RouteBuilderStop[]) {
  if (stops.length < 2) return null;

  const points = stops.map(
    (stop) => `${stop.client!.latitude},${stop.client!.longitude}`,
  );

  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1).join("|");

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });

  if (waypoints) {
    params.set("waypoints", waypoints);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}