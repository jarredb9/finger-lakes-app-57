"use client"

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { Winery } from '@/lib/types';

interface GenericMarkerClustererProps {
  wineries: Winery[];
  onClick: (winery: Winery) => void;
  color: string;
  strokeColor: string;
  zIndexBase: number;
  numbered?: boolean;
}

export default function GenericMarkerClusterer({ 
  wineries, 
  onClick, 
  color, 
  strokeColor, 
  zIndexBase,
  numbered = false 
}: GenericMarkerClustererProps) {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);

  // Initialize Clusterer
  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({ 
        map,
        renderer: {
          render: ({ count, position }) => {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path fill="${color}" stroke="${strokeColor}" stroke-width="2" d="M20 38.5C20 38.5 5 24.75 5 17.5A15 15 0 0 1 20 2.5a15 15 0 0 1 15 15c0 7.25-15 22-15 22Z"/><text x="20" y="17" font-size="14" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial, sans-serif">${count}</text></svg>`;
            return new google.maps.Marker({
              position,
              icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(42, 42), anchor: new google.maps.Point(20, 40) },
              zIndex: zIndexBase + count,
            });
          },
        }
      });
    }
  }, [map, color, strokeColor, zIndexBase]);

  // Update markers
  useEffect(() => {
    if (!clusterer.current) return;
    clusterer.current.clearMarkers();
    
    const newMarkers = wineries.map((winery, index) => {
      let markerOptions: google.maps.MarkerOptions = {
        position: { lat: winery.lat, lng: winery.lng },
        zIndex: zIndexBase,
      };

      if (numbered) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
          <path fill="${color}" stroke="${strokeColor}" stroke-width="1.5" d="M18 34.5C18 34.5 4 21.375 4 15A14 14 0 0 1 18 1a14 14 0 0 1 14 14c0 6.375-14 19.5-14 19.5Z"/>
          <text x="18" y="16" font-size="12" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial, sans-serif">${index + 1}</text>
        </svg>`;
        
        markerOptions.icon = {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
            scaledSize: new google.maps.Size(36, 36),
            anchor: new google.maps.Point(18, 36),
        };
      } else {
        markerOptions.icon = {
            path: `M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z`,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: strokeColor,
            strokeWeight: 1,
            scale: 1.5,
            anchor: new google.maps.Point(12, 24),
        };
      }

      const marker = new google.maps.Marker(markerOptions);
      marker.addListener('click', () => onClick(winery));
      return marker;
    });
    clusterer.current.addMarkers(newMarkers);
  }, [wineries, onClick, color, strokeColor, zIndexBase, numbered]);
  
  useEffect(() => {
    return () => clusterer.current?.clearMarkers();
  }, [])

  return null;
}
