/**
 * Geofence math helpers (AUTH-3).
 * Pure functions — no Supabase dependency yet. Once warehouses/stops
 * tables exist, swap the hardcoded TEST_LOCATIONS in useGeofence.ts
 * for real fetched rows; this file doesn't change.
 */

export type GeoPoint = {
	latitude: number;
	longitude: number;
};

export type GeofenceTarget = GeoPoint & {
	id: string;
	label: string;
	radiusMeters: number;
};

/**
 * Haversine distance between two points, in meters.
 */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
	const R = 6371000; // Earth radius in meters
	const toRad = (deg: number) => (deg * Math.PI) / 180;

	const dLat = toRad(b.latitude - a.latitude);
	const dLon = toRad(b.longitude - a.longitude);

	const lat1 = toRad(a.latitude);
	const lat2 = toRad(b.latitude);

	const sinDLat = Math.sin(dLat / 2);
	const sinDLon = Math.sin(dLon / 2);

	const h =
		sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
	const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

	return R * c;
}

/**
 * Checks current position against a list of geofence targets
 * (e.g. warehouse + first scheduled stop). Returns the nearest
 * target plus whether the user is within its radius.
 */
export function checkGeofences(
	current: GeoPoint,
	targets: GeofenceTarget[],
): {
	withinAny: boolean;
	nearest: GeofenceTarget | null;
	nearestDistanceMeters: number | null;
} {
	if (targets.length === 0) {
		return { withinAny: false, nearest: null, nearestDistanceMeters: null };
	}

	let nearest = targets[0];
	let nearestDistance = distanceMeters(current, targets[0]);

	for (const target of targets.slice(1)) {
		const d = distanceMeters(current, target);
		if (d < nearestDistance) {
			nearest = target;
			nearestDistance = d;
		}
	}

	const withinAny = targets.some(
		(t) => distanceMeters(current, t) <= t.radiusMeters,
	);

	return {
		withinAny,
		nearest,
		nearestDistanceMeters: nearestDistance,
	};
}
