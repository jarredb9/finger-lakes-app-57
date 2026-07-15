"use client";

import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import Map, { Source, Layer, MapRef } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";

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

// Mapbox source/layer configurations with stable references
const clusterLayer = {
  id: "clusters",
  type: "circle" as const,
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
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
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

// ------------------------------------------------------------------
// Google Maps to Mapbox API Adapter Layer
// Allows the rest of the application (hooks/stores) to interact with 
// the Google Map instance as if it were a Mapbox map instance.
// ------------------------------------------------------------------
class GoogleMapAdapter {
  public gmap: any;
  private listeners = new globalThis.Map<string, any[]>();

  constructor(gmap: any) {
    this.gmap = gmap;
  }

  get zoom() {
    return this.gmap.getZoom();
  }

  getZoom() {
    return this.gmap.getZoom();
  }

  setZoom(zoom: number) {
    this.gmap.setZoom(zoom);
  }

  setCenter(center: { lat: number; lng: number } | [number, number]) {
    if (Array.isArray(center)) {
      this.gmap.setCenter({ lat: center[1], lng: center[0] });
    } else {
      this.gmap.setCenter(center);
    }
  }

  flyTo(options: { center: [number, number]; zoom: number }) {
    this.gmap.setCenter({ lat: options.center[1], lng: options.center[0] });
    this.gmap.setZoom(options.zoom);
  }

  fitBounds(bounds: [[number, number], [number, number]] | any, _options?: any) {
    if (Array.isArray(bounds)) {
      const googleBounds = new window.google.maps.LatLngBounds(
        { lat: bounds[0][1], lng: bounds[0][0] },
        { lat: bounds[1][1], lng: bounds[1][0] }
      );
      this.gmap.fitBounds(googleBounds);
    } else {
      this.gmap.fitBounds(bounds);
    }
  }

  getBounds() {
    const gbounds = this.gmap.getBounds();
    if (!gbounds) return null;
    const ne = gbounds.getNorthEast();
    const sw = gbounds.getSouthWest();
    return {
      getNorthEast: () => ({ lat: ne.lat(), lng: ne.lng() }),
      getSouthWest: () => ({ lat: sw.lat(), lng: sw.lng() }),
      contains: (coord: any) => {
        if (Array.isArray(coord)) {
          return gbounds.contains({ lat: coord[1], lng: coord[0] });
        }
        return gbounds.contains(coord);
      }
    };
  }

  on(event: string, callback: (...args: any[]) => void) {
    let handle: any = null;
    if (event === "moveend") {
      handle = this.gmap.addListener("idle", callback);
    } else if (event === "click") {
      handle = this.gmap.addListener("click", (e: any) => {
        callback({
          placeId: e.placeId,
          stop: () => e.stop && e.stop()
        });
      });
    }
    if (handle) {
      const list = this.listeners.get(event) || [];
      list.push(handle);
      this.listeners.set(event, list);
    }
  }

  off(event: string, _callback?: (...args: any[]) => void) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach((handle: any) => handle.remove());
      this.listeners.delete(event);
    }
  }

  openStreetView(lat: number, lng: number) {
    const panorama = this.gmap.getStreetView();
    if (panorama) {
      panorama.setPosition({ lat, lng });
      panorama.setVisible(true);
    }
  }
}

// ------------------------------------------------------------------
// Google Maps Fallback Component
// Renders standard Google Map on a ref and synchronizes markers.
// ------------------------------------------------------------------
function GoogleMapFallback({
  discoveredWineries,
  visitedWineries,
  wishlistWineries,
  favoriteWineries,
  onMarkerClick
}: Omit<MapViewProps, "filter" | "selectedTrip">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapAdapter | null>(null);
  const markersRef = useRef<any[]>([]);
  const { setMap } = useMapStore();
  const [mapStyle, setMapStyle] = useState<"streets" | "outdoors">("streets");

  // Sync map type when mapStyle changes
  useEffect(() => {
    if (mapRef.current?.gmap) {
      mapRef.current.gmap.setMapTypeId(
        mapStyle === "outdoors" ? "terrain" : "roadmap"
      );
    }
  }, [mapStyle]);

  useEffect(() => {
    let active = true;

    async function initMap() {
      const mapsLib = await getGoogleLibrary("maps");
      if (!active || !containerRef.current) return;

      const gmap = new mapsLib.Map(containerRef.current, {
        center: { lat: 42.7, lng: -76.9 },
        zoom: 9,
        mapId: "DEMO_MAP_ID",
        fullscreenControl: false,
        streetViewControl: false,
        zoomControl: false,
        cameraControl: false,
        rotateControl: false,
        mapTypeControl: false,
      });

      const adapter = new GoogleMapAdapter(gmap);
      mapRef.current = adapter;
      setMap(adapter as any);

      // Apply initial style
      gmap.setMapTypeId(mapStyle === "outdoors" ? "terrain" : "roadmap");

      const panorama = gmap.getStreetView();
      if (panorama) {
        panorama.addListener("visible_changed", () => {
          useMapStore.getState().setIsStreetViewActive(panorama.getVisible());
        });
      }
    }

    initMap();

    return () => {
      active = false;
      setMap(null);
      useMapStore.getState().setIsStreetViewActive(false);
    };
  }, [setMap]);

  useEffect(() => {
    if (!mapRef.current) return;
    const gmap = mapRef.current.gmap;
    let active = true;

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const allWineries = [
      ...discoveredWineries.map(w => ({ ...w, type: 'discovered' })),
      ...visitedWineries.map(w => ({ ...w, type: 'visited' })),
      ...wishlistWineries.map(w => ({ ...w, type: 'wishlist' })),
      ...favoriteWineries.map(w => ({ ...w, type: 'favorite' })),
    ];

    allWineries.forEach(async (winery) => {
      const markerLib = await getGoogleLibrary("marker");
      const mapsLib = await getGoogleLibrary("maps");
      if (!active) return;
      
      const pinColors = {
        favorite: '#eab308', // Gold
        visited: '#16a34a',  // Green
        wishlist: '#a855f7', // Purple
        discovered: '#6b7280', // Gray
      };
      
      const color = pinColors[winery.type as keyof typeof pinColors] || '#4b5563';

      let marker;
      if (markerLib?.AdvancedMarkerElement) {
        const pinElement = new markerLib.PinElement({
          background: color,
          borderColor: '#ffffff',
          glyphColor: '#ffffff',
        });
        
        marker = new markerLib.AdvancedMarkerElement({
          map: gmap,
          position: { lat: winery.latitude, lng: winery.longitude },
          title: winery.name,
          content: pinElement,
          gmpClickable: true,
        });

        marker.addEventListener("gmp-click", () => {
          onMarkerClick(winery);
        });
      } else {
        marker = new mapsLib.Marker({
          map: gmap,
          position: { lat: winery.latitude, lng: winery.longitude },
          title: winery.name,
        });

        marker.addListener("click", () => {
          onMarkerClick(winery);
        });
      }

      markersRef.current.push(marker);
    });

    return () => {
      active = false;
    };
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries, onMarkerClick]);

  return (
    <div className="relative w-full h-full bg-muted">
      <div ref={containerRef} className="w-full h-full" />

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

    </div>
  );
}

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
  const isStreetViewActive = useMapStore((state) => state.isStreetViewActive);
  const [mapStyle, setMapStyle] = useState<"streets" | "outdoors">("streets");
  const [cursor, setCursor] = useState<string>("");

  const streetViewContainerRef = useRef<HTMLDivElement>(null);
  const streetViewPanoramaRef = useRef<any>(null);

  const openStreetView = useCallback(async (lat: number, lng: number) => {
    const streetViewLib = await getGoogleLibrary("streetView");
    if (!streetViewContainerRef.current) return;

    if (!streetViewPanoramaRef.current) {
      const panorama = new streetViewLib.StreetViewPanorama(streetViewContainerRef.current, {
        position: { lat, lng },
        visible: true,
        enableCloseButton: true
      });
      
      panorama.addListener("visible_changed", () => {
        const visible = panorama.getVisible();
        useMapStore.getState().setIsStreetViewActive(visible);
      });
      streetViewPanoramaRef.current = panorama;
    } else {
      streetViewPanoramaRef.current.setPosition({ lat, lng });
      streetViewPanoramaRef.current.setVisible(true);
    }
    useMapStore.getState().setIsStreetViewActive(true);
  }, []);

  // Sync map instance with mapStore
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

  // Combine and type all wineries
  const allWineries = useMemo(() => {
    const combined = [
      ...discoveredWineries.map(w => ({ ...w, type: "discovered" })),
      ...visitedWineries.map(w => ({ ...w, type: "visited" })),
      ...wishlistWineries.map(w => ({ ...w, type: "wishlist" })),
      ...favoriteWineries.map(w => ({ ...w, type: "favorite" })),
    ];
    return combined;
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries]);
 
  // Convert wineries to GeoJSON for Mapbox Source
  const wineriesGeoJSON = useMemo(() => {
    const geojson = {
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
          coordinates: [Number(winery.longitude), Number(winery.latitude)]
        }
      }))
    };
    return geojson;
  }, [allWineries]);



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

  const isSupported = mapboxgl.supported();
  if (!isSupported) {
    return (
      <GoogleMapFallback
        discoveredWineries={discoveredWineries}
        visitedWineries={visitedWineries}
        wishlistWineries={wishlistWineries}
        favoriteWineries={favoriteWineries}
        onMarkerClick={onMarkerClick}
      />
    );
  }

  return (
    <div className="relative h-full w-full bg-muted">
      {/* Street View Panorama Container */}
      <div 
        ref={streetViewContainerRef} 
        className="absolute inset-0 z-50 bg-background" 
        style={{ display: isStreetViewActive ? "block" : "none" }}
      />
      <Map
        ref={mapRef}
        onLoad={handleMapLoad}
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
      <div className="absolute bottom-24 group-[.sheet-open]:bottom-[calc(45vh+7.5rem)] md:bottom-4 left-4 z-30 bg-background/95 backdrop-blur-sm px-2.5 py-1 rounded-md border shadow-md text-[10px] text-muted-foreground flex items-center gap-1 select-none pointer-events-none transition-all duration-300">
        <span>Powered by</span>
        <span className="font-semibold text-foreground">Google</span>
      </div>
    </div>
  );
});

MapView.displayName = "MapView";

export default MapView;