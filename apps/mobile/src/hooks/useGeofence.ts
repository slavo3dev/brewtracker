import {
  checkGeofences,
  distanceMeters,
  type GeoPoint,
} from "@brewtracker/types";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";

import type { ClockTarget } from "../features/time-clock/time-clock.types";

export type GeofenceStatus =
  | "checking_permission"
  | "permission_denied"
  | "locating"
  | "in_range"
  | "out_of_range"
  | "no_targets"
  | "error";

type UseGeofenceResult = {
  status: GeofenceStatus;
  position: GeoPoint | null;
  distanceMeters: number | null;
  nearestTarget: ClockTarget | null;
  matchedTarget: ClockTarget | null;
  errorMessage: string | null;
};

export function useGeofence(targets: ClockTarget[]): UseGeofenceResult {
  const [status, setStatus] = useState<GeofenceStatus>("checking_permission");
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [nearestTarget, setNearestTarget] = useState<ClockTarget | null>(null);
  const [matchedTarget, setMatchedTarget] = useState<ClockTarget | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function start(): Promise<void> {
      setErrorMessage(null);

      if (targets.length === 0) {
        setStatus("no_targets");
        return;
      }

      setStatus("checking_permission");

      const { status: permissionStatus } =
        await Location.requestForegroundPermissionsAsync();

      if (!isMounted) {
        return;
      }

      if (permissionStatus !== "granted") {
        setStatus("permission_denied");
        return;
      }

      setStatus("locating");

      try {
        subscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 5,
          },
          (location) => {
            if (!isMounted) {
              return;
            }

            const currentPosition: GeoPoint = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };

            // Log the current GPS coordinates for debugging purposes
            console.log(
              "Current GPS:",
              location.coords.latitude,
              location.coords.longitude,
            );

            const result = checkGeofences(currentPosition, targets);

            const nearest =
              result.nearest == null
                ? null
                : (targets.find((target) => target.id === result.nearest?.id) ??
                  null);

            const matchingTarget =
              targets.find(
                (target) =>
                  distanceMeters(currentPosition, target) <=
                  target.radiusMeters,
              ) ?? null;

            setPosition(currentPosition);
            setDistance(result.nearestDistanceMeters);
            setNearestTarget(nearest);
            setMatchedTarget(matchingTarget);
            setStatus(matchingTarget ? "in_range" : "out_of_range");
          },
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Unknown location error.",
        );
        setStatus("error");
      }
    }

    void start();

    return () => {
      isMounted = false;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [targets]);

  return {
    status,
    position,
    distanceMeters: distance,
    nearestTarget,
    matchedTarget,
    errorMessage,
  };
}
