"use client";

import React from "react";
import { Winery, Visit } from "@/lib/types";
import { WineryModalTab } from "./use-winery-modal-state";
import { MobileWineryLayout } from "./mobile-winery-drawer";
import { TabletWineryLayout } from "./tablet-winery-sheet";
import { DesktopWineryLayout } from "./desktop-winery-modal";

export interface WineryModalContentProps {
  activeWineryId?: string | null;
  winery: Winery | null;
  loadingWineryId?: string | null;
  isLoading?: boolean;
  isAIEnabled?: boolean;
  isMobile?: boolean;
  isTablet?: boolean;
  isDesktop?: boolean;
  lightboxPhoto?: string | null;
  setLightboxPhoto?: (photo: string | null) => void;
  snapPoint?: string | number | null;
  setSnapPoint?: (snapPoint: string | number | null) => void;
  activeTab?: WineryModalTab;
  effectiveActiveTab?: WineryModalTab;
  setActiveTab?: (tab: WineryModalTab) => void;
  visits?: Visit[];
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  visitHistoryRef?: React.RefObject<HTMLDivElement | null>;
  onLogVisit?: () => void;
  onStreetView?: () => void;
  onToggleWishlist?: () => void;
  onToggleFavorite?: () => void;
  onToggleFavoritePrivacy?: (e: React.MouseEvent) => void;
  onToggleWishlistPrivacy?: (e: React.MouseEvent) => void;
  onEditVisit?: (visit: Visit) => void;
  onDeleteVisit?: (visitId: string) => void;
  onTripBadgeClick?: (tripId: number) => void;
  onClose?: () => void;
  children?: React.ReactNode;
}

export function WineryModalContent({
  activeWineryId,
  winery,
  isMobile = false,
  isTablet = false,
  isDesktop = false,
  children,
  ...props
}: WineryModalContentProps) {
  const resolvedWineryId = activeWineryId || (winery?.id ? String(winery.id) : "");

  return (
    <div
      data-testid="winery-modal-content"
      data-winery-id={resolvedWineryId}
      className="flex flex-col h-full min-h-0 overflow-hidden"
    >
      {children ? (
        children
      ) : isMobile ? (
        <MobileWineryLayout winery={winery} isMobile={isMobile} {...props} />
      ) : isTablet ? (
        <TabletWineryLayout winery={winery} {...props} />
      ) : (
        <DesktopWineryLayout winery={winery} {...props} />
      )}
    </div>
  );
}

export default WineryModalContent;
