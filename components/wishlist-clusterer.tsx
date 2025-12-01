"use client"

import GenericMarkerClusterer from './generic-marker-clusterer';
import type { Winery } from '@/lib/types';

interface WishlistClustererProps {
  wineries: Winery[];
  onClick: (winery: Winery) => void;
}

export default function WishlistClusterer({ wineries, onClick }: WishlistClustererProps) {
  return (
    <GenericMarkerClusterer
      wineries={wineries}
      onClick={onClick}
      color="#9333ea"
      strokeColor="#7e22ce"
      zIndexBase={2000}
    />
  );
}