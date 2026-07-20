import { Linking, Platform } from "react-native";

export type NavigationDestination = {
  latitude: number;
  longitude: number;
  label: string;
};

function encodeLabel(label: string): string {
  return encodeURIComponent(label.trim() || "Destination");
}

function createPlatformNavigationUrl({
  latitude,
  longitude,
  label,
}: NavigationDestination): string {
  const encodedLabel = encodeLabel(label);

  if (Platform.OS === "ios") {
    const destination = encodeURIComponent(`${latitude},${longitude}`);

    return `http://maps.apple.com/?daddr=${destination}&q=${encodedLabel}&dirflg=d`;
  }

  if (Platform.OS === "android") {
    return `geo:0,0?q=${latitude},${longitude}(${encodedLabel})`;
  }

  return createBrowserNavigationUrl({
    latitude,
    longitude,
    label,
  });
}

function createBrowserNavigationUrl({
  latitude,
  longitude,
}: NavigationDestination): string {
  const destination = encodeURIComponent(`${latitude},${longitude}`);

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

export async function openExternalNavigation(
  destination: NavigationDestination,
): Promise<void> {
  const platformUrl = createPlatformNavigationUrl(destination);

  try {
    const supported = await Linking.canOpenURL(platformUrl);

    if (supported) {
      await Linking.openURL(platformUrl);
      return;
    }
  } catch (error) {
    console.warn("Unable to open platform maps URL:", error);
  }

  const browserUrl = createBrowserNavigationUrl(destination);
  const fallbackSupported = await Linking.canOpenURL(browserUrl);

  if (!fallbackSupported) {
    throw new Error(
      "No supported maps application is available on this device.",
    );
  }

  await Linking.openURL(browserUrl);
}
