import { useRef } from "react";

export function useStreetViewPanorama() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isStreetViewActive = false;
  const openStreetView = async (_lat: number, _lng: number) => {};

  return {
    containerRef,
    isStreetViewActive,
    openStreetView,
  };
}
