"use client"

import GenericMarkerClusterer from './generic-marker-clusterer';
import type { Winery } from '@/lib/types';

interface TripWineryClustererProps {
  wineries: Winery[];
  onClick: (winery: Winery) => void;
}

export default function TripWineryClusterer({ wineries, onClick }: TripWineryClustererProps) {
  return (
    <GenericMarkerClusterer
      wineries={wineries}
      onClick={onClick}
      color="#f17e3a"
      strokeColor="#d26e32"
      zIndexBase={30}
      numbered={true}
    />
  );
}