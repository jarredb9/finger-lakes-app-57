"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Winery, Trip } from "@/lib/types";
import { useMapStore } from "@/lib/stores/mapStore";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";
import { GoogleMapAdapter } from "@/lib/maps/google-map-adapter";
import { PIN_COLORS } from "@/lib/maps/mapbox-layers";
import { Button } from "@/components/ui/button";
import { Compass, Navigation } from "lucide-react";

export interface GoogleMapFallbackProps {
  discoveredWineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  filter: string[];
  onMarkerClick: (winery: Winery) => void;
  selectedTrip?: Trip | null;
}

export function GoogleMapFallback({
  discoveredWineries,
  visitedWineries,
  wishlistWineries,
  favoriteWineries,
  filter,
  onMarkerClick,
  selectedTrip,
}: GoogleMapFallbackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapAdapter | null>(null);
  const [mapAdapter, setMapAdapter] = useState<GoogleMapAdapter | null>(null);
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
      setMapAdapter(adapter);
      setMap(adapter as any);

      // Apply initial style
      gmap.setMapTypeId(mapStyle === "outdoors" ? "terrain" : "roadmap");
    }

    initMap();

    return () => {
      active = false;
      mapRef.current = null;
      setMapAdapter(null);
      setMap(null);
    };
  }, [setMap]);

  const allWineries = useMemo(() => {
    const all: any[] = [];
    if (selectedTrip?.wineries?.length) {
      all.push(...selectedTrip.wineries.map((w) => ({ ...w, type: "trip" })));
    } else {
      const hasCategory = filter.some((f) =>
        ["all", "visited", "favorites", "wantToGo", "notVisited"].includes(f)
      );
      const showAll = filter.includes("all") || !hasCategory;

      if (showAll || filter.includes("notVisited")) {
        all.push(...discoveredWineries.map((w) => ({ ...w, type: "discovered" })));
      }
      if (showAll || filter.includes("visited")) {
        all.push(...visitedWineries.map((w) => ({ ...w, type: "visited" })));
      }
      if (showAll || filter.includes("wantToGo")) {
        all.push(...wishlistWineries.map((w) => ({ ...w, type: "wishlist" })));
      }
      if (showAll || filter.includes("favorites")) {
        all.push(...favoriteWineries.map((w) => ({ ...w, type: "favorite" })));
      }
    }
    return all;
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries, filter, selectedTrip]);

  useEffect(() => {
    if (!mapAdapter) return;
    const gmap = mapAdapter.gmap;
    let active = true;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap && m.setMap(null));
    markersRef.current = [];

    allWineries.forEach(async (winery) => {
      const markerLib = await getGoogleLibrary("marker");
      const mapsLib = await getGoogleLibrary("maps");
      if (!active) return;

      const color = PIN_COLORS[winery.type as keyof typeof PIN_COLORS] || "#4b5563";

      let marker: any;
      if (markerLib?.AdvancedMarkerElement) {
        const pinElement = new markerLib.PinElement({
          background: color,
          borderColor: "#ffffff",
          glyphColor: "#ffffff",
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
      } else if (mapsLib?.Marker) {
        marker = new mapsLib.Marker({
          map: gmap,
          position: { lat: winery.latitude, lng: winery.longitude },
          title: winery.name,
        });

        marker.addListener("click", () => {
          onMarkerClick(winery);
        });
      }

      if (marker) {
        markersRef.current.push(marker);
      }
    });

    return () => {
      active = false;
    };
  }, [mapAdapter, allWineries, onMarkerClick]);

  return (
    <div data-testid="google-map-fallback" className="relative w-full h-full bg-muted">
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
