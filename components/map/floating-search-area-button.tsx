"use client";

import { SerializableBounds } from "@/lib/stores/mapStore";

export interface FloatingSearchAreaButtonProps {
  onClick?: () => void;
  autoSearch?: boolean;
  isSearching?: boolean;
  currentCenter?: { lat: number; lng: number };
  lastSearchedBounds?: SerializableBounds | null;
  className?: string;
}

export function FloatingSearchAreaButton(_props: FloatingSearchAreaButtonProps) {
  return null; // Stub for TDD Red phase
}

export default FloatingSearchAreaButton;
