"use client";

import React from "react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Winery, Visit } from "@/lib/types";
import { HeroPhotoCarousel } from "./hero-photo-carousel";
import { PhotoLightboxModal } from "./photo-lightbox-modal";
import { WineryModalTab } from "./use-winery-modal-state";
import { WineryModalTabsList, WineryModalTabContent } from "./winery-modal-tabs";
import { WineryTripBadge } from "./winery-trip-badge";
import { WineryVibeScroller } from "./winery-vibe-scroller";
import { WineryDetails } from "../WineryDetails";
import { WineryActionsPresentational } from "../WineryActionsPresentational";
import { WineryWeatherWidget } from "../WineryWeatherWidget";

export interface TabletWineryLayoutProps {
  winery: Winery | null;
  loadingWineryId?: string | null;
  isLoading?: boolean;
  isAIEnabled?: boolean;
  lightboxPhoto?: string | null;
  setLightboxPhoto?: (photo: string | null) => void;
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
}

export interface TabletWinerySheetProps extends TabletWineryLayoutProps {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

export function TabletWineryLayout({
  winery,
  loadingWineryId = null,
  isLoading = false,
  isAIEnabled = false,
  lightboxPhoto: _lightboxPhoto = null,
  setLightboxPhoto = () => {},
  effectiveActiveTab = "community",
  setActiveTab = () => {},
  visits = [],
  scrollContainerRef = { current: null },
  visitHistoryRef = { current: null },
  onLogVisit = () => {},
  onStreetView = () => {},
  onToggleWishlist = () => {},
  onToggleFavorite = () => {},
  onToggleFavoritePrivacy = () => {},
  onToggleWishlistPrivacy = () => {},
  onEditVisit = () => {},
  onDeleteVisit = () => {},
  onTripBadgeClick = () => {},
  onClose = () => {},
}: TabletWineryLayoutProps) {
  if (isLoading || !winery) {
    return (
      <div className="p-4 space-y-4 flex flex-col flex-1 overflow-y-auto">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid grid-cols-4 gap-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex flex-col flex-1 overflow-y-auto scrollbar-thin"
    >
      {/* Hero Carousel */}
      <div className="relative shrink-0">
        <HeroPhotoCarousel
          winery={winery}
          isFull={false}
          isMobile={false}
          onPhotoClick={setLightboxPhoto}
        />
      </div>

      {/* Info & Details */}
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* Header Title & Rating */}
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight leading-tight text-foreground">
            {winery.name}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {typeof winery.rating === "number" && winery.rating > 0 && (
              <div className="flex items-center gap-1 font-semibold text-foreground">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{winery.rating}</span>
              </div>
            )}
            {winery.address && (
              <span className="truncate">{winery.address}</span>
            )}
          </div>
        </div>

        <WineryTripBadge winery={winery} onTripBadgeClick={onTripBadgeClick} />

        <WineryVibeScroller winery={winery} compact={true} />

        {/* Quick Actions */}
        <div className="pt-1">
          <WineryActionsPresentational
            winery={winery}
            onLogVisit={onLogVisit}
            onStreetView={onStreetView}
            onToggleWishlist={onToggleWishlist}
            onToggleFavorite={onToggleFavorite}
            onToggleFavoritePrivacy={onToggleFavoritePrivacy}
            onToggleWishlistPrivacy={onToggleWishlistPrivacy}
          />
        </div>

        {/* Weather Widget */}
        {winery.latitude && winery.longitude && (
          <div className="flex justify-center">
            <WineryWeatherWidget
              latitude={winery.latitude}
              longitude={winery.longitude}
            />
          </div>
        )}

        <WineryDetails winery={winery} loadingWineryId={loadingWineryId} mode="info" />

        {/* Tabs Section */}
        <div className="pt-2 flex flex-col flex-1 space-y-3">
          <WineryModalTabsList
            effectiveActiveTab={effectiveActiveTab}
            setActiveTab={setActiveTab}
            isAIEnabled={isAIEnabled}
            size="sm"
          />
          <div className="pt-2 flex-1">
            <WineryModalTabContent
              winery={winery}
              effectiveActiveTab={effectiveActiveTab}
              isAIEnabled={isAIEnabled}
              loadingWineryId={loadingWineryId}
              visits={visits}
              visitHistoryRef={visitHistoryRef}
              onEditVisit={onEditVisit}
              onDeleteVisit={onDeleteVisit}
              onClose={onClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TabletWinerySheet(props: TabletWinerySheetProps) {
  const {
    isOpen,
    onClose,
    winery,
    isLoading = false,
    lightboxPhoto = null,
    setLightboxPhoto = () => {},
    children,
  } = props;

  if (!isOpen) return null;

  return (
    <>
      <div
        data-testid="tablet-winery-sheet"
        data-state={isLoading ? "loading" : "ready"}
        className="fixed top-4 right-4 bottom-4 w-[420px] max-w-[calc(100vw-420px)] z-30 flex flex-col bg-background/95 backdrop-blur-md shadow-2xl rounded-2xl border border-border overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300"
      >
        {/* Floating Close Button */}
        <div className="absolute top-3 right-3 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close winery details"
            className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-md hover:bg-background shadow-xs border"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {children || <TabletWineryLayout {...props} />}
      </div>

      {lightboxPhoto && (
        <PhotoLightboxModal
          winery={winery}
          photoRef={lightboxPhoto}
          onClose={() => setLightboxPhoto(null)}
        />
      )}
    </>
  );
}

export default TabletWinerySheet;
