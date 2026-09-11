"use client";

import React, { memo, useRef, useState, useMemo, useCallback, Component } from "react";
import dynamic from "next/dynamic";
import Map, { Source, Layer, MapRef } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { Winery, Trip } from "@/lib/types";
import { useUIStore } from "@/lib/stores/uiStore";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { Compass, Navigation } from "lucide-react";
import {
  MAP_STYLES,
  clusterLayer,
  clusterCountLayer,
  unclusteredPointLayer,
} from "@/lib/maps/mapbox-layers";

const GoogleMapFallback = dynamic(
  () => import("./google-map-fallback").then((mod) => mod.GoogleMapFallback),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="map-fallback-loading"
        className="h-full w-full bg-muted animate-pulse"
      />
    ),
  }
);

interface MapErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
  onError?: (error: Error, errorInfo?: React.ErrorInfo) => void;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  constructor(props: MapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

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
  const closeWineryModal = useUIStore((s) => s.closeWineryModal);
  const [mapStyle, setMapStyle] = useState<"streets" | "outdoors">("streets");
  const [cursor, setCursor] = useState<string>("");
  const [mapboxFailed, setMapboxFailed] = useState<boolean>(false);

  const handleMapLoad = useCallback(() => {
    mapRef.current?.getMap()?.resize?.();
  }, []);

  const handleMapError = useCallback((_e: any) => {
    setMapboxFailed(true);
  }, []);

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

  // Convert wineries to GeoJSON for Mapbox Source with finite coordinate sanitization
  const wineriesGeoJSON = useMemo(() => {
    const validWineries = allWineries.filter((winery) => {
      const lat = Number(winery.latitude);
      const lng = Number(winery.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });

    return {
      type: "FeatureCollection" as const,
      features: validWineries.map((winery) => ({
        type: "Feature" as const,
        properties: {
          id: winery.id,
          name: winery.name,
          address: winery.address,
          latitude: Number(winery.latitude),
          longitude: Number(winery.longitude),
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
        data-testid="map-view-canvas"
        data-state="loading"
        className="h-full w-full min-h-[300px] bg-muted animate-pulse overflow-hidden"
      />
    );
  }

  const isSupported = mapboxgl.supported();
  if (!isSupported || mapboxFailed) {
    return (
      <div
        data-testid="map-view-canvas"
        data-state="ready"
        className="relative h-full w-full min-h-[300px] bg-muted overflow-hidden"
      >
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
      data-testid="map-view-canvas"
      data-state="ready"
      className="relative h-full w-full min-h-[300px] bg-muted overflow-hidden"
    >
      <MapErrorBoundary
        onError={() => setMapboxFailed(true)}
        fallback={
          <GoogleMapFallback
            discoveredWineries={discoveredWineries}
            visitedWineries={visitedWineries}
            wishlistWineries={wishlistWineries}
            favoriteWineries={favoriteWineries}
            filter={filter}
            onMarkerClick={onMarkerClick}
            selectedTrip={_selectedTrip}
          />
        }
      >
        <Map
          ref={mapRef}
          id="default"
          onLoad={handleMapLoad}
          onError={handleMapError}
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
      </MapErrorBoundary>

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

export { MapView };
export default MapView;