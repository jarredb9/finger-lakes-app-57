import { useCallback } from "react";
import { useMapStore } from "@/lib/stores/mapStore";

export function useStreetViewPanorama() {
  const isStreetViewActive = useMapStore((state) => state.isStreetViewActive);

  const openStreetView = useCallback((lat: number, lng: number) => {
    if (typeof window !== "undefined") {
      const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  return {
    isStreetViewActive,
    openStreetView,
  };
}
