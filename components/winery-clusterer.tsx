"use client"

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { Winery } from '@/lib/types';

interface WineryClustererProps {
  wineries: Winery[];
  onClick: (winery: Winery) => void;
}

export default function WineryClusterer({ wineries, onClick }: WineryClustererProps) {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const markers = useRef<Record<string, google.maps.Marker>>({});

  // Initialize Clusterer
  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({ 
        map,
        renderer: {
          render: ({ count, position }) =>
            new google.maps.Marker({
              position,
              label: {
                text: String(count),
                color: "white",
                fontSize: "12px",
                fontWeight: "bold",
              },
              // Custom icon for the cluster
              icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' +
                     encodeURIComponent('<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="#059669" stroke="#047857" stroke-width="2"/></svg>'),
                scaledSize: new google.maps.Size(40, 40),
              },
              // Opt-out of clustering this marker
              zIndex: google.maps.Marker.MAX_ZINDEX + 1,
            }),
        }
      });
    }
  }, [map]);

  // Update markers
  useEffect(() => {
    if (!clusterer.current) return;
    
    // Clear existing markers
    clusterer.current.clearMarkers();
    
    // Add new markers
    const newMarkers = wineries.map(winery => {
      const marker = new google.maps.Marker({
        position: { lat: winery.lat, lng: winery.lng },
        icon: { // Custom icon to match your green visited pin style
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#10B981',
            fillOpacity: 1,
            strokeColor: '#059669',
            strokeWeight: 2,
        },
      });
      // Add a click listener to each individual marker
      marker.addListener('click', () => onClick(winery));
      return marker;
    });

    clusterer.current.addMarkers(newMarkers);

  }, [wineries, onClick]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
        if(clusterer.current) {
            clusterer.current.clearMarkers();
        }
    }
  }, [])

  return null; // This component renders directly on the map, not in the React DOM
}