"use client";

import { Calendar as CalendarIcon, Star, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Winery, Visit } from "@/lib/types";
import { getWineryVibeTags } from "@/lib/utils/winery";
import { HeroPhotoCarousel } from "./hero-photo-carousel";
import { PhotoLightboxModal } from "./photo-lightbox-modal";
import { WineryModalTab } from "./use-winery-modal-state";
import { WineryDetails } from "../WineryDetails";
import { WineryActionsPresentational } from "../WineryActionsPresentational";
import { WineryCommunityTab } from "../WineryCommunityTab";
import { WineryVarietalsTab } from "../WineryVarietalsTab";
import { WineryWeatherWidget } from "../WineryWeatherWidget";
import TripPlannerSection from "../TripPlannerSection";
import VisitCardHistory from "../VisitCardHistory";

export interface TabletWinerySheetProps {
  isOpen: boolean;
  onClose: () => void;
  winery: Winery | null;
  loadingWineryId: string | null;
  isLoading: boolean;
  isAIEnabled: boolean;
  lightboxPhoto: string | null;
  setLightboxPhoto: (photo: string | null) => void;
  activeTab: WineryModalTab;
  effectiveActiveTab: WineryModalTab;
  setActiveTab: (tab: WineryModalTab) => void;
  visits: Visit[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  visitHistoryRef: React.RefObject<HTMLDivElement | null>;
  onLogVisit: () => void;
  onStreetView: () => void;
  onToggleWishlist: () => void;
  onToggleFavorite: () => void;
  onToggleFavoritePrivacy: (e: React.MouseEvent) => void;
  onToggleWishlistPrivacy: (e: React.MouseEvent) => void;
  onEditVisit: (visit: Visit) => void;
  onDeleteVisit: (visitId: string) => void;
  onTripBadgeClick: (tripId: number) => void;
}

export function TabletWinerySheet({
  isOpen,
  onClose,
  winery,
  loadingWineryId,
  isLoading,
  isAIEnabled,
  lightboxPhoto,
  setLightboxPhoto,
  effectiveActiveTab,
  setActiveTab,
  visits,
  scrollContainerRef,
  visitHistoryRef,
  onLogVisit,
  onStreetView,
  onToggleWishlist,
  onToggleFavorite,
  onToggleFavoritePrivacy,
  onToggleWishlistPrivacy,
  onEditVisit,
  onDeleteVisit,
  onTripBadgeClick,
}: TabletWinerySheetProps) {
  if (!isOpen) return null;

  const renderTabsList = () => (
    <div className="flex border-b border-border/50 w-full overflow-x-auto scrollbar-none flex-nowrap justify-between shrink-0" role="tablist">
      {[
        { id: "community", label: "Community" },
        { id: "amenities", label: "Amenities" },
        ...(isAIEnabled ? [{ id: "ai_insights", label: "AI Insights" }] : []),
        { id: "varietals", label: "Varietals" },
        { id: "visits", label: "Visits" },
        { id: "trip", label: "Trip" },
      ].map((t) => {
        const isActive = effectiveActiveTab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTab(t.id as WineryModalTab)}
            className={`py-2 px-3 text-xs font-semibold border-b-2 transition-all duration-200 whitespace-nowrap shrink-0 ${
              isActive
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const renderActiveTabContent = () => {
    if (!winery) return null;
    switch (effectiveActiveTab) {
      case "community":
        return <WineryCommunityTab wineryDbId={winery.dbId ?? null} />;
      case "amenities":
        return <WineryDetails winery={winery} loadingWineryId={loadingWineryId} mode="logistics" />;
      case "ai_insights":
        return isAIEnabled ? (
          <WineryDetails winery={winery} loadingWineryId={loadingWineryId} mode="ai_insights" />
        ) : (
          <WineryCommunityTab wineryDbId={winery.dbId ?? null} />
        );
      case "varietals":
        return (
          <WineryVarietalsTab
            varietals={winery.varietals ?? undefined}
            reviews={winery.reviews}
          />
        );
      case "visits":
        return (
          <div className="space-y-4" data-testid="visits-tab-content">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4" />
                <span>Your Visits</span>
              </h3>
            </div>
            {visits.length > 0 ? (
              <div ref={visitHistoryRef}>
                <VisitCardHistory
                  visits={visits}
                  editingVisitId={null}
                  onEditClick={onEditVisit}
                  onDeleteVisit={onDeleteVisit}
                  onTogglePhotoForDeletion={() => {}}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">
                {winery.userVisited
                  ? "You haven't reviewed any visits here yet."
                  : "You haven't visited this winery yet."}
              </p>
            )}
          </div>
        );
      case "trip":
        return <TripPlannerSection winery={winery} onClose={onClose} />;
      default:
        return null;
    }
  };

  const renderContent = () => {
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

    const vibeTags = getWineryVibeTags(winery);

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
              {winery.rating && (
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

          {/* Trip Badge */}
          {winery.trip_name && winery.trip_date && winery.trip_id && (
            <div
              data-testid="trip-badge"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTripBadgeClick(winery.trip_id!);
                }
              }}
              className="inline-flex items-center self-start rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-semibold bg-[#f17e3a] hover:bg-[#f17e3a]/90 text-white cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 shadow-xs"
              onClick={() => onTripBadgeClick(winery.trip_id!)}
            >
              <Clock className="w-3 h-3 mr-1" />
              On Trip: {winery.trip_name}
            </div>
          )}

          {/* Vibe Tags */}
          {vibeTags.length > 0 && (
            <div
              data-testid="vibe-tags-scroller"
              className="flex gap-1.5 overflow-x-auto scrollbar-none py-1 flex-nowrap"
            >
              {vibeTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 border border-primary/20 text-primary flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

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

          {/* Winery Details Logistics Mode */}
          <WineryDetails winery={winery} loadingWineryId={loadingWineryId} mode="info" />

          {/* Tabs Section */}
          <div className="pt-2 flex flex-col flex-1 space-y-3">
            {renderTabsList()}
            <div className="pt-2 flex-1">{renderActiveTabContent()}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        data-testid="tablet-winery-sheet"
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

        {renderContent()}
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
