import type { ComponentProps } from "react";
import type { Layer } from "react-map-gl/mapbox";

export type MapboxLayerProps = ComponentProps<typeof Layer>;

export const MAP_STYLES = {
  streets: "mapbox://styles/mapbox/streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
} as const;

export const PIN_COLORS = {
  favorite: "#eab308", // Gold
  visited: "#16a34a",  // Green
  wishlist: "#a855f7", // Purple
  discovered: "#6b7280", // Gray
  trip: "#f97316",     // Orange
} as const;

export const clusterLayer: MapboxLayerProps = {
  id: "clusters",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#64748b", // low density (< 5) - slate-500
      5,
      "#3b82f6", // medium density (5-9) - blue-500
      10,
      "#10b981", // high density (>= 10) - emerald-500
    ],
    "circle-radius": [
      "step",
      ["get", "point_count"],
      18,
      5,
      22,
      10,
      26,
    ],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

export const clusterCountLayer: MapboxLayerProps = {
  id: "cluster-count",
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-size": 12,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: {
    "text-color": "#ffffff",
  },
};

export const unclusteredPointLayer: MapboxLayerProps = {
  id: "unclustered-point",
  type: "circle",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": [
      "match",
      ["get", "type"],
      "trip",
      PIN_COLORS.trip,
      "favorite",
      PIN_COLORS.favorite,
      "visited",
      PIN_COLORS.visited,
      "wishlist",
      PIN_COLORS.wishlist,
      "discovered",
      PIN_COLORS.discovered,
      PIN_COLORS.discovered,
    ],
    "circle-radius": 7,
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#ffffff",
  },
};
