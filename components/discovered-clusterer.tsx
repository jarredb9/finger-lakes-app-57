"use client"

import GenericMarkerClusterer from './generic-marker-clusterer';
import type { Winery } from '@/lib/types';

interface DiscoveredClustererProps {
  wineries: Winery[];
  onClick: (winery: Winery) => void;
}

export default function DiscoveredClusterer({ wineries, onClick }: DiscoveredClustererProps) {
  return (
    <GenericMarkerClusterer
      wineries={wineries}
      onClick={onClick}
      color="#3B82F6"
      strokeColor="#2563EB"
      zIndexBase={1000}
    />
  );
}