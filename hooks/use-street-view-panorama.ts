import { useRef, useCallback } from "react";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";
import { useMapStore } from "@/lib/stores/mapStore";

export function useStreetViewPanorama() {
  const isStreetViewActive = useMapStore((state) => state.isStreetViewActive);
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<any>(null);

  const openStreetView = useCallback(async (lat: number, lng: number) => {
    const streetViewLib = await getGoogleLibrary("streetView");
    if (!containerRef.current) return;

    if (!panoramaRef.current) {
      const panorama = new streetViewLib.StreetViewPanorama(containerRef.current, {
        position: { lat, lng },
        visible: true,
        enableCloseButton: true,
      });

      panorama.addListener("visible_changed", () => {
        const visible = panorama.getVisible();
        useMapStore.getState().setIsStreetViewActive(visible);
      });
      panoramaRef.current = panorama;
    } else {
      panoramaRef.current.setPosition({ lat, lng });
      panoramaRef.current.setVisible(true);
    }
    useMapStore.getState().setIsStreetViewActive(true);
  }, []);

  return {
    containerRef,
    isStreetViewActive,
    openStreetView,
  };
}
