import React from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Calendar as CalendarIcon, Star, Pencil, ChevronUp, ChevronDown, Navigation } from "lucide-react";
import { Winery, Visit } from "@/lib/types";
import { isOpenNow } from "@/lib/utils/opening-hours";
import { getWineryVibeTags } from "@/lib/utils/winery";
import { HeroPhotoCarousel } from "./hero-photo-carousel";
import { PhotoLightboxModal } from "./photo-lightbox-modal";
import { WineryModalTab } from "./use-winery-modal-state";
import { WineryDetails } from "../WineryDetails";
import { WineryActionsPresentational } from "../WineryActionsPresentational";
import { WineryCommunityTab } from "../WineryCommunityTab";
import { WineryVarietalsTab } from "../WineryVarietalsTab";
import { WineryWeatherWidget } from "../WineryWeatherWidget";
import { MapNavigation } from "../MapNavigation";
import TripPlannerSection from "../TripPlannerSection";
import VisitCardHistory from "../VisitCardHistory";

export interface MobileWineryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  winery: Winery | null;
  loadingWineryId: string | null;
  isLoading: boolean;
  isAIEnabled: boolean;
  isMobile?: boolean;
  lightboxPhoto: string | null;
  setLightboxPhoto: (photo: string | null) => void;
  snapPoint: string | number | null;
  setSnapPoint: (snapPoint: string | number | null) => void;
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

export function MobileWineryDrawer({
  isOpen,
  onClose,
  winery,
  loadingWineryId,
  isLoading,
  isAIEnabled,
  isMobile = true,
  lightboxPhoto,
  setLightboxPhoto,
  snapPoint,
  setSnapPoint,
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
}: MobileWineryDrawerProps) {
  const renderTabsList = () => (
    <div className="flex border-b border-border/50 w-full overflow-x-auto scrollbar-none flex-nowrap justify-between" role="tablist">
      {[
        { id: "community", label: "Community" },
        { id: "amenities", label: "Amenities" },
        ...(isAIEnabled ? [{ id: "ai_insights", label: "AI Insights" }] : []),
        { id: "varietals", label: "Varietals" },
        { id: "visits", label: "Visits" },
        { id: "trip", label: "Trip" }
      ].map((t) => {
        const isActive = effectiveActiveTab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTab(t.id as WineryModalTab)}
            className={`py-2.5 px-3.5 text-xs md:text-sm font-semibold border-b-2 transition-all duration-300 whitespace-nowrap shrink-0 ${
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
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
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
              <p className="text-sm text-muted-foreground text-center py-6">
                {winery.userVisited ? "You haven't reviewed any visits here yet." : "You haven't visited this winery yet."}
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

  const renderMobileLayout = () => {
    if (isLoading || !winery) {
      return (
        <div className="flex flex-col h-[300px] overflow-hidden p-4 space-y-4">
          <Skeleton className="h-10 w-3/4 mx-auto rounded-lg text-center" />
          <div className="grid grid-cols-4 gap-2">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      );
    }

    const isOpen = isOpenNow(winery.openingHours);
    const isFull = snapPoint === "100%" || snapPoint === 1 || snapPoint === "1" || (typeof window !== "undefined" && !!(window as any)._E2E_FULL_DRAWER);
    const isPeek = !isFull && snapPoint === "300px";
    const isHalf = !isPeek && !isFull;

    const vibeTags = getWineryVibeTags(winery);
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Pinned Header: Flush Top Hero Photo Carousel */}
        <div className="relative w-full shrink-0 bg-muted rounded-t-[20px] overflow-hidden">
          {/* Flush Hero Image Carousel with Height Scaling */}
          <div className={`relative w-full ${isPeek ? "h-48" : isHalf ? "h-40" : "h-56 sm:h-64"}`}>
            <HeroPhotoCarousel 
              winery={winery} 
              isFull={isFull} 
              isMobile={isMobile} 
              onPhotoClick={setLightboxPhoto} 
            />
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/90 to-transparent pointer-events-none z-10" />

            {/* Overlaid Translucent Open Status Badge */}
            <span
              data-testid="peek-open-status-tag"
              className="absolute top-3 right-3 z-20 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-black/40 backdrop-blur-md text-white border border-white/20 shadow-xs"
            >
              {isOpen ? "🟢 OPEN NOW" : "🔴 CLOSED"}
            </span>
          </div>
        </div>

        {/* Option B: Translucent Floating Title Card with Right-Aligned Expand Chevron Button */}
        <div 
          data-testid="drawer-title-card"
          onClick={() => {
            const nextSnap = snapPoint === "300px" ? "520px" : snapPoint === "520px" ? 1 : "300px";
            setSnapPoint(nextSnap);
          }}
          className={`px-4 relative z-20 cursor-pointer -mt-10`}
          role="button"
          aria-label={isPeek ? "Tap for more details" : isHalf ? "Tap for full details" : "Tap to collapse view"}
        >
          <div className="bg-background/85 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl p-3 sm:p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center justify-between gap-3 max-w-sm mx-auto group hover:border-primary/40 transition-colors">
            <div className="flex-1 min-w-0 text-left">
              <h2 className="text-lg sm:text-xl font-bold text-foreground leading-tight truncate">{winery.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground font-medium mt-0.5">
                {winery.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-foreground text-foreground" />
                    <span className="text-foreground font-semibold">{winery.rating}</span>
                    <span className="px-1 text-muted-foreground/40">|</span>
                  </div>
                )}
                <span className="truncate">{winery.address}</span>
              </div>
            </div>

            {/* Dedicated Right-Aligned Chevron Expand Button */}
            <div 
              data-testid="drawer-expand-chevron-button"
              className="shrink-0 w-8 h-8 rounded-full bg-muted/80 border border-border/40 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:bg-muted transition-all shadow-xs"
            >
              {isFull ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </div>
          </div>
        </div>

        {/* Peek Primary Action Bar (Directions + Log Visit) */}
        {isPeek && (
          <div className="px-4 pt-2.5 pb-1.5 flex items-center gap-3 shrink-0">
            <div className="flex-1">
              <MapNavigation
                address={winery.address}
                wineryName={winery.name}
                latitude={winery.latitude}
                longitude={winery.longitude}
              >
                <button
                  type="button"
                  data-testid="route-from-current"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-border/60 bg-muted/80 text-sm font-bold text-foreground hover:bg-muted transition-all active:scale-98 shadow-sm"
                >
                  <Navigation className="w-4.5 h-4.5 text-blue-500 fill-blue-500" />
                  <span>Directions</span>
                </button>
              </MapNavigation>
            </div>
            <button
              type="button"
              data-testid="log-visit-button"
              onClick={onLogVisit}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#6B1536] hover:bg-[#58102b] text-white text-sm font-bold transition-all shadow-md active:scale-98"
            >
              <Pencil className="w-4 h-4" />
              <span>Log Visit</span>
            </button>
          </div>
        )}

        <div 
          ref={scrollContainerRef}
          className={`flex-1 flex flex-col min-h-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${isFull ? "overflow-y-auto pb-10" : "overflow-hidden pb-4"} flex`}
        >
          <div className="px-4 mt-2.5 space-y-2.5">
            {/* 4-Grid Quick Action Tiles */}
            <WineryActionsPresentational 
              winery={winery} 
              onLogVisit={onLogVisit}
              onStreetView={onStreetView}
              onToggleWishlist={onToggleWishlist}
              onToggleFavorite={onToggleFavorite}
              onToggleFavoritePrivacy={onToggleFavoritePrivacy}
              onToggleWishlistPrivacy={onToggleWishlistPrivacy}
              showLogVisit={false}
            />

            {/* Outdoor Weather Widget */}
            {winery.latitude && winery.longitude && (
              <div className="flex justify-center">
                <WineryWeatherWidget latitude={winery.latitude} longitude={winery.longitude} />
              </div>
            )}

            {/* Prominent Full-Width Log Visit CTA Button */}
            {!isPeek && (
              <button
                type="button"
                data-testid="log-visit-button"
                onClick={onLogVisit}
                className="w-full py-3 px-4 rounded-xl bg-[#6B1536] hover:bg-[#58102b] text-white font-bold text-sm transition-all duration-200 shadow-md flex items-center justify-center gap-2 active:scale-98"
              >
                <Pencil className="w-4 h-4" />
                <span>Log Visit</span>
              </button>
            )}

            {/* Horizontal Vibe & Specialty Badges Scroller */}
            {vibeTags.length > 0 && (
              <div className="overflow-x-auto scrollbar-none flex items-center gap-2 py-1 flex-nowrap" data-testid="vibe-tags-scroller">
                {vibeTags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 border border-primary/20 text-primary flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

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
                className="inline-flex items-center rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-semibold bg-[#f17e3a] hover:bg-[#f17e3a]/90 text-white cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm"
                onClick={() => onTripBadgeClick(winery.trip_id!)}
              >
                <Clock className="w-3 h-3 mr-1" />
                On Trip: {winery.trip_name}
              </div>
            )}

            {/* Contact Overview Card */}
            <WineryDetails winery={winery} loadingWineryId={loadingWineryId} mode="info" />

            {/* Interaction Tabs */}
            {isFull && (
              <div className="space-y-4 pt-2">
                {renderTabsList()}
                <div className="pt-2">
                  {renderActiveTabContent()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Drawer 
      open={isOpen} 
      onOpenChange={(open) => !open && onClose()}
      snapPoints={["300px", "520px", 1]}
      activeSnapPoint={snapPoint}
      setActiveSnapPoint={(val) => {
        const isE2EFull = typeof window !== "undefined" && (window as any)._E2E_FULL_DRAWER;
        setSnapPoint(isE2EFull ? 1 : val);
      }}
      modal={false}
      dismissible={true}
    >
      <DrawerContent 
        showOverlay={false}
        data-testid="winery-modal-drawer"
        data-snap-points="300px,520px,1"
        data-state={isLoading ? "loading" : "ready"}
        className="backdrop-blur-xl bg-background/95 border-t border-border/50 shadow-2xl rounded-t-[20px] overflow-hidden p-0 gap-0"
      >
        <DrawerHeader className="sr-only">
          <DrawerTitle>{winery?.name || "Winery Details"}</DrawerTitle>
          <DrawerDescription>
            Winery details for {winery?.name || "selected winery"}.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden" data-testid="drawer-scroll-container">
          {renderMobileLayout()}
        </div>
        <PhotoLightboxModal
          winery={winery}
          photoRef={lightboxPhoto}
          onClose={() => setLightboxPhoto(null)}
          onPhotoSelect={setLightboxPhoto}
        />
      </DrawerContent>
    </Drawer>
  );
}

export default MobileWineryDrawer;
