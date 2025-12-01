"use client"

import GenericMarkerClusterer from './generic-marker-clusterer';
import type { Winery } from '@/lib/types';

interface FavoriteClustererProps {
  wineries: Winery[];
  onClick: (winery: Winery) => void;
}

export default function FavoriteClusterer({ wineries, onClick }: FavoriteClustererProps) {
  return (
    <GenericMarkerClusterer
      wineries={wineries}
      onClick={onClick}
      color="#FBBF24"
      strokeColor="#F59E0B"
      zIndexBase={4000}
    />
  );
}