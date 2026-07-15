"use client";

import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import Map, { Source, Layer, MapRef } from "react-map-gl";

import { Winery, Trip } from "@/lib/types";
import { useMapStore } from "@/lib/stores/mapStore";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { Compass, Navigation } from "lucide-react";

interface MapViewProps {
  discoveredWineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  filter: string[];
  onMarkerClick: (winery: Winery) => void;
  selectedTrip?: Trip | null;
}

const STYLES = {
  streets: "mapbox://styles/mapbox/streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12"
};

const MapView = memo(({
  discoveredWineries,
  visitedWineries,
  wishlistWineries,
  favoriteWineries,
  filter: _filter,
  onMarkerClick,
  selectedTrip: _selectedTrip
}: MapViewProps) => {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const mounted = useMounted();
  const mapRef = useRef<MapRef>(null);
  const { setMap } = useMapStore();
  const [mapStyle, setMapStyle] = useState<"streets" | "outdoors">("streets");
  const [cursor, setCursor] = useState<string>("");

  // Sync map instance with mapStore
  useEffect(() => {
    if (mapRef.current) {
      setMap(mapRef.current);
    }
    return () => {
      setMap(null);
    };
  }, [setMap]);

  // Combine and type all wineries
  const allWineries = useMemo(() => {
    return [
      ...discoveredWineries.map(w => ({ ...w, type: "discovered" })),
      ...visitedWineries.map(w => ({ ...w, type: "visited" })),
      ...wishlistWineries.map(w => ({ ...w, type: "wishlist" })),
      ...favoriteWineries.map(w => ({ ...w, type: "favorite" })),
    ];
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries]);

  // Convert wineries to GeoJSON for Mapbox Source
  const wineriesGeoJSON = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: allWineries.map(winery => ({
        type: "Feature" as const,
        properties: {
          id: winery.id,
          name: winery.name,
          address: winery.address,
          latitude: winery.latitude,
          longitude: winery.longitude,
          type: winery.type
        },
        geometry: {
          type: "Point" as const,
          coordinates: [winery.longitude, winery.latitude]
        }
      }))
    };
  }, [allWineries]);

  // Cluster styling matching shadcn/ui
  const clusterLayer = {
    id: "clusters",
    type: "circle" as const,
    source: "wineries",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#64748b", // low density (< 5) - slate-500
        5,
        "#3b82f6", // medium density (5-9) - blue-500
        10,
        "#10b981"  // high density (>= 10) - emerald-500
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18,
        5,
        22,
        10,
        26
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff"
    }
  };

  const clusterCountLayer = {
    id: "cluster-count",
    type: "symbol" as const,
    source: "wineries",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true
    },
    paint: {
      "text-color": "#ffffff"
    }
  };

  const unclusteredPointLayer = {
    id: "unclustered-point",
    type: "circle" as const,
    source: "wineries",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "type"],
        "favorite", "#eab308",
        "visited", "#16a34a",
        "wishlist", "#a855f7",
        "discovered", "#6b7280",
        "#6b7280"
      ],
      "circle-radius": 7,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff"
    }
  };

  const onMapClick = useCallback((event: any) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const features = map.queryRenderedFeatures(event.point, {
      layers: ["clusters", "unclustered-point"]
    });

    if (!features.length) return;

    const clickedFeature = features[0];
    if (clickedFeature.layer.id === "clusters") {
      const clusterId = clickedFeature.properties?.cluster_id;
      const source = map.getSource("wineries") as any;
      source.getClusterExpansionZoom(clusterId, (err: any, zoom?: number | null) => {
        if (err || !zoom) return;
        map.easeTo({
          center: (clickedFeature.geometry as any).coordinates,
          zoom: zoom
        });
      });
    } else if (clickedFeature.layer.id === "unclustered-point") {
      const wineryId = clickedFeature.properties?.id;
      const winery = allWineries.find(w => w.id === wineryId);
      if (winery) {
        onMarkerClick(winery);
      }
    }
  }, [allWineries, onMarkerClick]);

  const onMouseEnter = useCallback(() => setCursor("pointer"), []);
  const onMouseLeave = useCallback(() => setCursor(""), []);

  if (!mounted) {
    return <div className="h-full w-full bg-muted animate-pulse" />;
  }

  return (
    <div className="relative h-full w-full bg-muted">
      <Map
        ref={mapRef}
        initialViewState={{
          latitude: 42.7,
          longitude: -76.9,
          zoom: 9
        }}
        mapboxAccessToken={mapboxToken}
        mapStyle={STYLES[mapStyle]}
        onClick={onMapClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        cursor={cursor}
        interactiveLayerIds={["clusters", "unclustered-point"]}
      >
        <Source
          id="wineries"
          type="geojson"
          data={wineriesGeoJSON}
          cluster={true}
          clusterMaxZoom={14}
          clusterRadius={50}
        >
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredPointLayer} />
        </Source>
      </Map>

      {/* Floating Style Switcher Control */}
      <div className="absolute top-4 right-4 z-10 flex gap-1 bg-background/90 backdrop-blur-sm p-1 rounded-lg border shadow-sm">
        <Button
          size="sm"
          variant={mapStyle === "outdoors" ? "default" : "ghost"}
          onClick={() => setMapStyle("outdoors")}
          className="h-7 px-2.5 text-xs gap-1.5"
        >
          <Compass className="h-3.5 w-3.5" />
          <span>Outdoors</span>
        </Button>
        <Button
          size="sm"
          variant={mapStyle === "streets" ? "default" : "ghost"}
          onClick={() => setMapStyle("streets")}
          className="h-7 px-2.5 text-xs gap-1.5"
        >
          <Navigation className="h-3.5 w-3.5" />
          <span>Streets</span>
        </Button>
      </div>

      {/* Floating Google Attribution Badge */}
      <div className="absolute bottom-4 left-4 z-10 bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-md border shadow-sm text-[10px] text-muted-foreground flex items-center gap-1 select-none pointer-events-none">
        <span>Powered by</span>
        <span className="font-semibold text-foreground">Google</span>
      </div>
    </div>
  );
});

MapView.displayName = "MapView";

export default MapView;