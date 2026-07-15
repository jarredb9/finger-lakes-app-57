/**
 * Converts a { latitude, longitude } object to a Mapbox [longitude, latitude] coordinate array.
 */
export function coordToMapbox(coord: { latitude: number; longitude: number }): [number, number] {
  return [coord.longitude, coord.latitude];
}

/**
 * Converts a Mapbox [longitude, latitude] coordinate array to a { latitude, longitude } object.
 */
export function mapboxToCoord(coords: [number, number]): { latitude: number; longitude: number } {
  return {
    latitude: coords[1],
    longitude: coords[0]
  };
}

/**
 * Checks if a coordinate is within the given bounds.
 * Supports Google Maps LatLngBounds, Mapbox LngLatBounds, and serializable bounding boxes.
 */
export function isCoordinateInBounds(
  coord: { latitude: number; longitude: number } | undefined | null,
  bounds: any
): boolean {
  if (!coord || !bounds) return false;
  const { latitude: lat, longitude: lng } = coord;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;

  // 1. Check for a contains method (e.g. Google Maps or Mapbox LngLatBounds instances)
  if (typeof bounds.contains === 'function') {
    try {
      // Try google structure first: { lat, lng }
      if (bounds.contains({ lat, lng })) return true;
    } catch (e) {}

    try {
      // Try mapbox structure: [lng, lat] or { lng, lat }
      if (bounds.contains([lng, lat])) return true;
    } catch (e) {}

    try {
      if (bounds.contains({ lng, lat })) return true;
    } catch (e) {}
  }

  // 2. Check for getSouthWest/getNorthEast methods (e.g. Mapbox LngLatBounds or Google LatLngBounds mocks)
  let sw: any = null;
  let ne: any = null;

  if (typeof bounds.getSouthWest === 'function' && typeof bounds.getNorthEast === 'function') {
    sw = bounds.getSouthWest();
    ne = bounds.getNorthEast();
  } else if (bounds.sw && bounds.ne) {
    sw = bounds.sw;
    ne = bounds.ne;
  } else if (bounds._sw && bounds._ne) {
    sw = bounds._sw;
    ne = bounds._ne;
  }

  if (sw && ne) {
    const swLat = typeof sw.lat === 'function' ? sw.lat() : sw.lat ?? sw.south ?? sw[1];
    const swLng = typeof sw.lng === 'function' ? sw.lng() : sw.lng ?? sw.west ?? sw[0];
    const neLat = typeof ne.lat === 'function' ? ne.lat() : ne.lat ?? ne.north ?? ne[1];
    const neLng = typeof ne.lng === 'function' ? ne.lng() : ne.lng ?? ne.east ?? ne[0];

    if (swLat !== undefined && swLng !== undefined && neLat !== undefined && neLng !== undefined) {
      const latInRange = swLat <= neLat ? (lat >= swLat && lat <= neLat) : (lat >= neLat && lat <= swLat);
      const lngInRange = swLng <= neLng ? (lng >= swLng && lng <= neLng) : (lng >= swLng || lng <= neLng);
      return latInRange && lngInRange;
    }
  }

  // 3. Plain bounding box object with west, south, east, north keys or min/max representation
  const west = bounds.west ?? bounds.lngMin ?? bounds.minLng ?? (Array.isArray(bounds) ? (Array.isArray(bounds[0]) ? bounds[0][0] : bounds[0]) : undefined);
  const south = bounds.south ?? bounds.latMin ?? bounds.minLat ?? (Array.isArray(bounds) ? (Array.isArray(bounds[0]) ? bounds[0][1] : bounds[1]) : undefined);
  const east = bounds.east ?? bounds.lngMax ?? bounds.maxLng ?? (Array.isArray(bounds) ? (Array.isArray(bounds[1]) ? bounds[1][0] : bounds[2]) : undefined);
  const north = bounds.north ?? bounds.latMax ?? bounds.maxLat ?? (Array.isArray(bounds) ? (Array.isArray(bounds[1]) ? bounds[1][1] : bounds[3]) : undefined);

  if (west !== undefined && south !== undefined && east !== undefined && north !== undefined) {
    const latInRange = south <= north ? (lat >= south && lat <= north) : (lat >= north && lat <= south);
    const lngInRange = west <= east ? (lng >= west && lng <= east) : (lng >= west || lng <= east);
    return latInRange && lngInRange;
  }

  return false;
}

/**
 * Safely extracts coordinates (swLat, swLng, neLat, neLng) from various bounds representations.
 */
export function getCoordinatesFromBounds(bounds: any): { swLat: number; swLng: number; neLat: number; neLng: number } | null {
  if (!bounds) return null;
  let sw: any = null;
  let ne: any = null;

  if (typeof bounds.getSouthWest === 'function' && typeof bounds.getNorthEast === 'function') {
    sw = bounds.getSouthWest();
    ne = bounds.getNorthEast();
  } else if (bounds.sw && bounds.ne) {
    sw = bounds.sw;
    ne = bounds.ne;
  } else if (bounds._sw && bounds._ne) {
    sw = bounds._sw;
    ne = bounds._ne;
  }

  if (sw && ne) {
    const swLat = typeof sw.lat === 'function' ? sw.lat() : sw.lat ?? sw.south ?? sw[1];
    const swLng = typeof sw.lng === 'function' ? sw.lng() : sw.lng ?? sw.west ?? sw[0];
    const neLat = typeof ne.lat === 'function' ? ne.lat() : ne.lat ?? ne.north ?? ne[1];
    const neLng = typeof ne.lng === 'function' ? ne.lng() : ne.lng ?? ne.east ?? ne[0];
    if (swLat !== undefined && swLng !== undefined && neLat !== undefined && neLng !== undefined) {
      return { swLat, swLng, neLat, neLng };
    }
  }

  const west = bounds.west ?? bounds.lngMin ?? bounds.minLng ?? (Array.isArray(bounds) ? (Array.isArray(bounds[0]) ? bounds[0][0] : bounds[0]) : undefined);
  const south = bounds.south ?? bounds.latMin ?? bounds.minLat ?? (Array.isArray(bounds) ? (Array.isArray(bounds[0]) ? bounds[0][1] : bounds[1]) : undefined);
  const east = bounds.east ?? bounds.lngMax ?? bounds.maxLng ?? (Array.isArray(bounds) ? (Array.isArray(bounds[1]) ? bounds[1][0] : bounds[2]) : undefined);
  const north = bounds.north ?? bounds.latMax ?? bounds.maxLat ?? (Array.isArray(bounds) ? (Array.isArray(bounds[1]) ? bounds[1][1] : bounds[3]) : undefined);

  if (west !== undefined && south !== undefined && east !== undefined && north !== undefined) {
    return { swLat: south, swLng: west, neLat: north, neLng: east };
  }

  return null;
}

