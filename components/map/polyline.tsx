"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";

interface PolylineProps extends google.maps.PolylineOptions {
  encodedPath?: string;
}

export type PolylineRef = google.maps.Polyline | null;

/**
 * A component to render a polyline on a Google Map.
 * Wraps the native google.maps.Polyline class.
 */
export const Polyline = forwardRef<PolylineRef, PolylineProps>((props, ref) => {
  const { path, encodedPath, ...options } = props;
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useImperativeHandle(ref, () => polylineRef.current as google.maps.Polyline, []);

  useEffect(() => {
    if (!map) return;

    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        map,
        ...options,
      });
    } else {
      polylineRef.current.setOptions(options);
    }

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, options]);

  useEffect(() => {
    if (!polylineRef.current) return;

    if (encodedPath) {
      const decodedPath = google.maps.geometry.encoding.decodePath(encodedPath);
      polylineRef.current.setPath(decodedPath);
    } else if (path) {
      polylineRef.current.setPath(path);
    }
  }, [path, encodedPath]);

  return null;
});

Polyline.displayName = "Polyline";
