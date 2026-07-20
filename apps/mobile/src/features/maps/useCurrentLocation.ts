import type { GeoPoint } from "@brewtracker/types";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

type LocationStatus = "loading" | "ready" | "permission_denied" | "error";

type UseCurrentLocationResult = {
  position: GeoPoint | null;
  status: LocationStatus;
  errorMessage: string | null;
  retry: () => Promise<void>;
};

export function useCurrentLocation(): UseCurrentLocationResult {
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [status, setStatus] = useState<LocationStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLocation = useCallback(async (): Promise<void> => {
    setStatus("loading");
    setErrorMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setPosition(null);
        setStatus("permission_denied");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setPosition({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      setStatus("ready");
    } catch (error) {
      setPosition(null);
      setStatus("error");

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to determine your location.",
      );
    }
  }, []);

  useEffect(() => {
    void loadLocation();
  }, [loadLocation]);

  return {
    position,
    status,
    errorMessage,
    retry: loadLocation,
  };
}
