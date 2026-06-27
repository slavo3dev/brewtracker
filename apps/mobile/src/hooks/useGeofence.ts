import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { checkGeofences, type GeofenceTarget } from '../lib/geofence';

/**
 * TEMPORARY test data (AUTH-3 data layer not built yet — that's
 * warehouses/stops tables, pending ROUTE-1). Swap this for a real
 * Supabase fetch once those tables exist; the hook's return shape
 * stays the same.
 */
const TEST_LOCATIONS: GeofenceTarget[] = [
	{
		id: 'test-warehouse-1',
		label: 'Warehouse (test)',
		latitude: 26.2379,
		longitude: -80.1248,
		radiusMeters: 150,
	},
	// First scheduled stop would go here once ROUTE data exists.
];

export type GeofenceStatus =
	| 'checking_permission'
	| 'permission_denied'
	| 'locating'
	| 'in_range'
	| 'out_of_range'
	| 'error';

export function useGeofence(targets: GeofenceTarget[] = TEST_LOCATIONS) {
	const [status, setStatus] = useState<GeofenceStatus>('checking_permission');
	const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
	const [nearestLabel, setNearestLabel] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

	useEffect(() => {
		let isMounted = true;

		async function start() {
			const { status: permStatus } =
				await Location.requestForegroundPermissionsAsync();

			if (!isMounted) return;

			if (permStatus !== 'granted') {
				setStatus('permission_denied');
				return;
			}

			setStatus('locating');

			try {
				subscriptionRef.current = await Location.watchPositionAsync(
					{
						accuracy: Location.Accuracy.High,
						timeInterval: 4000,
						distanceInterval: 5,
					},
					(position) => {
						if (!isMounted) return;

						const current = {
							latitude: position.coords.latitude,
							longitude: position.coords.longitude,
						};

						const result = checkGeofences(current, targets);

						setDistanceMeters(result.nearestDistanceMeters);
						setNearestLabel(result.nearest?.label ?? null);
						setStatus(
							result.withinAny ? 'in_range' : 'out_of_range',
						);
					},
				);
			} catch (err) {
				if (!isMounted) return;
				setErrorMessage(
					err instanceof Error
						? err.message
						: 'Unknown location error',
				);
				setStatus('error');
			}
		}

		start();

		return () => {
			isMounted = false;
			subscriptionRef.current?.remove();
		};
		// targets intentionally omitted from deps — TEST_LOCATIONS is a
		// stable module-level constant for now; revisit once targets are
		// fetched dynamically.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return { status, distanceMeters, nearestLabel, errorMessage };
}
