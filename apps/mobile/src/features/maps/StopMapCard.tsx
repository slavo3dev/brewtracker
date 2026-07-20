import type { GeoPoint } from "@brewtracker/types";
import { useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, type LatLng, type Region } from "react-native-maps";

type Props = {
  destination: GeoPoint;
  destinationLabel: string;
  currentPosition: GeoPoint | null;
  loadingCurrentPosition: boolean;
  locationPermissionDenied: boolean;
  locationErrorMessage: string | null;
  onRetryLocation: () => void;
};

const DEFAULT_LATITUDE_DELTA = 0.025;
const DEFAULT_LONGITUDE_DELTA = 0.025;

function createInitialRegion(destination: GeoPoint): Region {
  return {
    latitude: destination.latitude,
    longitude: destination.longitude,
    latitudeDelta: DEFAULT_LATITUDE_DELTA,
    longitudeDelta: DEFAULT_LONGITUDE_DELTA,
  };
}

export default function StopMapCard({
  destination,
  destinationLabel,
  currentPosition,
  loadingCurrentPosition,
  locationPermissionDenied,
  locationErrorMessage,
  onRetryLocation,
}: Props) {
  const mapRef = useRef<MapView | null>(null);

  function handleFitMap(): void {
    const coordinates: LatLng[] = [
      {
        latitude: destination.latitude,
        longitude: destination.longitude,
      },
    ];

    if (currentPosition) {
      coordinates.push({
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
      });
    }

    if (coordinates.length === 1) {
      mapRef.current?.animateToRegion(createInitialRegion(destination), 350);

      return;
    }

    mapRef.current?.fitToCoordinates(coordinates, {
      animated: true,
      edgePadding: {
        top: 70,
        right: 70,
        bottom: 70,
        left: 70,
      },
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={createInitialRegion(destination)}
          showsCompass
          showsScale
          showsUserLocation={currentPosition !== null}
          showsMyLocationButton={false}
          onMapReady={handleFitMap}
        >
          <Marker
            coordinate={{
              latitude: destination.latitude,
              longitude: destination.longitude,
            }}
            title={destinationLabel}
            description="Scheduled service stop"
          />

          {currentPosition ? (
            <Marker
              coordinate={{
                latitude: currentPosition.latitude,
                longitude: currentPosition.longitude,
              }}
              title="Current location"
              pinColor="#3a6b3e"
            />
          ) : null}
        </MapView>

        <Pressable style={styles.fitButton} onPress={handleFitMap}>
          <Text style={styles.fitButtonText}>Center map</Text>
        </Pressable>
      </View>

      {loadingCurrentPosition ? (
        <View style={styles.locationState}>
          <ActivityIndicator color="#7a3f2c" size="small" />

          <Text style={styles.locationStateText}>Getting your location…</Text>
        </View>
      ) : null}

      {locationPermissionDenied ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            Location permission is disabled. You can still view the destination
            and open navigation.
          </Text>

          <Pressable onPress={onRetryLocation}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {locationErrorMessage ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>{locationErrorMessage}</Text>

          <Pressable onPress={onRetryLocation}>
            <Text style={styles.retryText}>Retry location</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  mapContainer: {
    height: 300,
    position: "relative",
  },
  fitButton: {
    backgroundColor: "rgba(255, 253, 250, 0.94)",
    borderColor: "#e2d4c0",
    borderRadius: 9,
    borderWidth: 1,
    bottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: "absolute",
    right: 14,
  },
  fitButtonText: {
    color: "#7a3f2c",
    fontSize: 12,
    fontWeight: "700",
  },
  locationState: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  locationStateText: {
    color: "#8a6f53",
    fontSize: 13,
    marginLeft: 9,
  },
  warningCard: {
    backgroundColor: "#f7eadc",
    borderTopColor: "#e2d4c0",
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  warningText: {
    color: "#8a5a3c",
    fontSize: 13,
    lineHeight: 18,
  },
  retryText: {
    color: "#7a3f2c",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },
});
