"use client";

import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import Map, { Source, Layer, MapRef } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";

import { Winery, Trip } from "@/lib/types";
import { useMapStore } from "@/lib/stores/mapStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useMounted } from "@/hooks/use-mounted";
import { useStreetViewPanorama } from "@/hooks/use-street-view-panorama";
import { Button } from "@/components/ui/button";
import { Compass, Navigation } from "lucide-react";
import {
  MAP_STYLES,
  clusterLayer,
  clusterCountLayer,
  unclusteredPointLayer,
} from "@/lib/maps/mapbox-layers";
import { GoogleMapFallback } from "./google-map-fallback";

export interface MapViewProps {
  discoveredWineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  filter: string[];
  onMarkerClick: (winery: Winery) => void;
  selectedTrip?: Trip | null;
}

const MapView = memo(({
  discoveredWineries,
  visitedWineries,
  wishlistWineries,
  favoriteWineries,
  filter,
  onMarkerClick,
  selectedTrip: _selectedTrip,
}: MapViewProps) => {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const mounted = useMounted();
  const mapRef = useRef<MapRef>(null);
  const { setMap } = useMapStore();
  const { closeWineryModal } = useUIStore();
  const [mapStyle, setMapStyle] = useState<"streets" | "outdoors">("streets");
  const [cursor, setCursor] = useState<string>("");

  const { containerRef: streetViewContainerRef, isStreetViewActive, openStreetView } =
    useStreetViewPanorama();

  // Sync map instance with mapStore and attach openStreetView contract
  const handleMapLoad = useCallback(() => {
    if (mapRef.current) {
      const mapInstance = mapRef.current;
      (mapInstance as any).openStreetView = openStreetView;
      setMap(mapInstance);
    }
  }, [setMap, openStreetView]);

  useEffect(() => {
    return () => {
      setMap(null);
    };
  }, [setMap]);

  // Combine and type all wineries based on selected filters
  const allWineries = useMemo(() => {
    if (_selectedTrip?.wineries?.length) {
      return _selectedTrip.wineries.map((w) => ({
        ...w,
        type: "trip",
      }));
    }

    const hasCategory = filter.some((f) =>
      ["all", "visited", "favorites", "wantToGo", "notVisited"].includes(f)
    );
    const showAll = filter.includes("all") || !hasCategory;

    const list: any[] = [];
    if (showAll || filter.includes("notVisited")) {
      list.push(...discoveredWineries.map((w) => ({ ...w, type: "discovered" })));
    }
    if (showAll || filter.includes("visited")) {
      list.push(...visitedWineries.map((w) => ({ ...w, type: "visited" })));
    }
    if (showAll || filter.includes("wantToGo")) {
      list.push(...wishlistWineries.map((w) => ({ ...w, type: "wishlist" })));
    }
    if (showAll || filter.includes("favorites")) {
      list.push(...favoriteWineries.map((w) => ({ ...w, type: "favorite" })));
    }
    return list;
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries, filter, _selectedTrip]);

  // Convert wineries to GeoJSON for Mapbox Source
  const wineriesGeoJSON = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: allWineries.map((winery) => ({
        type: "Feature" as const,
        properties: {
          id: winery.id,
          name: winery.name,
          address: winery.address,
          latitude: winery.latitude,
          longitude: winery.longitude,
          type: winery.type,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [Number(winery.longitude), Number(winery.latitude)],
        },
      })),
    };
  }, [allWineries]);

  const onMapClick = useCallback(
    (event: any) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = map.queryRenderedFeatures(event.point, {
        layers: ["clusters", "unclustered-point"],
      });

      if (!features.length) {
        closeWineryModal();
        return;
      }

      const clickedFeature = features[0];
      if (clickedFeature.layer.id === "clusters") {
        const clusterId = clickedFeature.properties?.cluster_id;
        const source = map.getSource("wineries") as any;
        source.getClusterExpansionZoom(clusterId, (err: any, zoom?: number | null) => {
          if (err || !zoom) return;
          map.easeTo({
            center: (clickedFeature.geometry as any).coordinates,
            zoom: zoom,
          });
        });
      } else if (clickedFeature.layer.id === "unclustered-point") {
        const wineryId = clickedFeature.properties?.id;
        const winery = allWineries.find((w) => w.id === wineryId);
        if (winery) {
          onMarkerClick(winery);
        }
      }
    },
    [allWineries, onMarkerClick, closeWineryModal]
  );

  const onMouseEnter = useCallback(() => setCursor("pointer"), []);
  const onMouseLeave = useCallback(() => setCursor(""), []);

  if (!mounted) {
    return (
      <div
        data-testid="map-container"
        data-state="loading"
        className="h-full w-full bg-muted animate-pulse"
      />
    );
  }

  const isSupported = mapboxgl.supported();
  if (!isSupported) {
    return (
      <div data-testid="map-container" data-state="ready" className="relative h-full w-full">
        <GoogleMapFallback
          discoveredWineries={discoveredWineries}
          visitedWineries={visitedWineries}
          wishlistWineries={wishlistWineries}
          favoriteWineries={favoriteWineries}
          filter={filter}
          onMarkerClick={onMarkerClick}
          selectedTrip={_selectedTrip}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="map-container"
      data-state="ready"
      className="relative h-full w-full bg-muted"
    >
      {/* Street View Panorama Container */}
      <div
        ref={streetViewContainerRef}
        className="absolute inset-0 z-50 bg-background"
        style={{
          visibility: isStreetViewActive ? "visible" : "hidden",
          pointerEvents: isStreetViewActive ? "auto" : "none",
        }}
      />
      <Map
        ref={mapRef}
        onLoad={handleMapLoad}
        initialViewState={{
          latitude: 42.7,
          longitude: -76.9,
          zoom: 9,
        }}
        mapboxAccessToken={mapboxToken}
        mapStyle={MAP_STYLES[mapStyle]}
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
      <div className="absolute top-4 left-4 z-30 flex gap-1 bg-background/95 backdrop-blur-sm p-1 rounded-lg border shadow-md">
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
      <div className="absolute bottom-24 group-[.sheet-open]:bottom-[calc(45vh+7.5rem)] lg:bottom-4 left-4 z-30 bg-background/95 backdrop-blur-sm px-2.5 py-1 rounded-md border shadow-md text-[10px] text-muted-foreground flex items-center gap-1 select-none pointer-events-none transition-all duration-300">
        <span>Powered by</span>
        <span className="font-semibold text-foreground">Google</span>
      </div>
    </div>
  );
});

MapView.displayName = "MapView";

export default MapView;