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
