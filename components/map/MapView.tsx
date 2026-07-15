"use client";
import { memo, useEffect, useRef } from "react";
import MapboxMap from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import { Winery, Trip } from "@/lib/types";
import { useMapStore } from "@/lib/stores/mapStore";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";

import { useMounted } from "@/hooks/use-mounted";

interface MapViewProps {
  discoveredWineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  filter: string[];
  onMarkerClick: (winery: Winery) => void;
  selectedTrip?: Trip | null;
}

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
      setMap(adapter);

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

  return <div ref={containerRef} className="w-full h-full" />;
}

// ------------------------------------------------------------------
// Primary MapView Component with WebGL Capability Branching
// ------------------------------------------------------------------
const MapView = memo(
  (props: MapViewProps) => {
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    const mounted = useMounted();

    if (!mounted) {
      return <div className="h-full w-full bg-muted" />;
    }

    const isSupported = mapboxgl.supported();

    if (!isSupported) {
      return (
        <GoogleMapFallback
          discoveredWineries={props.discoveredWineries}
          visitedWineries={props.visitedWineries}
          wishlistWineries={props.wishlistWineries}
          favoriteWineries={props.favoriteWineries}
          onMarkerClick={props.onMarkerClick}
        />
      );
    }

    return (
      <div className="h-full w-full bg-muted">
        <MapboxMap
          initialViewState={{
            latitude: 42.7,
            longitude: -76.9,
            zoom: 9
          }}
          mapboxAccessToken={mapboxToken}
          mapStyle="mapbox://styles/mapbox/streets-v12"
        />
      </div>
    );
  }
);

MapView.displayName = "MapView";

export default MapView;