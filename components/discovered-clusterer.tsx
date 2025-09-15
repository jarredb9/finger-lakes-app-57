"use client"

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { Winery } from '@/lib/types';

interface DiscoveredClustererProps {
  wineries: Winery[];
  onClick: (winery: Winery) => void;
}

export default function DiscoveredClusterer({ wineries, onClick }: DiscoveredClustererProps) {
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
            // Blue SVG Pin for clusters
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
                <path fill="#3B82F6" stroke="#2563EB" stroke-width="2" d="M20 38.5C20 38.5 5 24.75 5 17.5A15 15 0 0 1 20 2.5a15 15 0 0 1 15 15c0 7.25-15 22-15 22Z"/>
                <text x="20" y="17" font-size="14" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial, sans-serif">${count}</text>
              </svg>`;
            
            return new google.maps.Marker({
              position,
              icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                scaledSize: new google.maps.Size(42, 42),
                anchor: new google.maps.Point(20, 40),
              },
              // Lowest zIndex for discovered clusters
              zIndex: 100 + count,
            });
          },
        }
      });
    }
  }, [map]);

  // Update markers
  useEffect(() => {
    if (!clusterer.current) return;
    
    clusterer.current.clearMarkers();
    
    const newMarkers = wineries.map(winery => {
      const marker = new google.maps.Marker({
        position: { lat: winery.lat, lng: winery.lng },
        icon: {
            path: `M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z`,
            fillColor: '#3B82F6', // Blue color for discovered
            fillOpacity: 1,
            strokeColor: '#2563EB',
            strokeWeight: 1,
            scale: 1.5,
            anchor: new google.maps.Point(12, 24),
        },
        zIndex: 10, // Lowest zIndex for individual markers
      });
      marker.addListener('click', () => onClick(winery));
      return marker;
    });

    clusterer.current.addMarkers(newMarkers);
  }, [wineries, onClick, clusterer.current]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => clusterer.current?.clearMarkers();
  }, [])

  return null;
}