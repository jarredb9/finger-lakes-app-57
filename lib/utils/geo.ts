/**
 * Geolocation utilities for calculating distances.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Calculates the straight-line distance between two coordinates using the Haversine formula.
 * @returns Distance in miles.
 */
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLon = toRad(coord2.lng - coord1.lng);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Formats a distance value for display.
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return "< 0.1 mi";
  return `${miles.toFixed(1)} mi`;
}
