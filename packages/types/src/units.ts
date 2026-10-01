const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;

export function metersToFeet(meters: number): number {
  return meters / METERS_PER_FOOT;
}

export function feetToMeters(feet: number): number {
  return feet * METERS_PER_FOOT;
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

export function formatFeet(meters: number): string {
  return `${Math.round(metersToFeet(meters))} ft`;
}

export function formatDistanceMeters(meters: number): string {
  // Use miles starting at one-tenth of a mile.
  if (meters >= METERS_PER_MILE / 10) {
    return `${metersToMiles(meters).toFixed(1)} mi`;
  }

  return formatFeet(meters);
}