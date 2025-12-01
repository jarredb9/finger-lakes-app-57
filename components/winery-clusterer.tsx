"use client"

import GenericMarkerClusterer from './generic-marker-clusterer';
import type { Winery } from '@/lib/types';

interface WineryClustererProps {
  wineries: Winery[];
  onClick: (winery: Winery) => void;
}

export default function WineryClusterer({ wineries, onClick }: WineryClustererProps) {
  return (
    <GenericMarkerClusterer
      wineries={wineries}
      onClick={onClick}
      color="#10B981"
      strokeColor="#059669"
      zIndexBase={3000}
    />
  );
}