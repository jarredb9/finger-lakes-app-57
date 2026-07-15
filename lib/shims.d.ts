declare module "react-map-gl/mapbox" {
  export const useMap: () => { current: any };
  export const MapProvider: any;
  export const Marker: any;
  const Map: any;
  export default Map;
}

declare module "react-map-gl" {
  export const Source: any;
  export const Layer: any;
  export const Marker: any;
  export const MapProvider: any;
  export const useMap: () => { current: any };
  export type MapRef = any;
  const Map: any;
  export default Map;
}
