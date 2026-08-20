import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Calendar as CalendarIcon, Star } from "lucide-react";
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

export interface DesktopWineryModalProps {
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

export function DesktopWineryModal({
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
}: DesktopWineryModalProps) {
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

  const renderContent = () => {
    if (isLoading || !winery) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 h-[500px] overflow-hidden">
          <div className="flex flex-col" data-testid="modal-left-column">
            {/* Hero Image skeleton with overlay skeleton */}
            <div className="relative h-48 w-full bg-muted animate-pulse">
              <div className="absolute bottom-0 left-0 right-0 bg-background/60 backdrop-blur-md p-3 border-t border-border/30 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
            <div className="p-6 pt-4 space-y-4 flex flex-col flex-1">
              <div className="grid grid-cols-4 gap-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
          <div className="space-y-4 flex flex-col border-l border-border/50 p-6" data-testid="modal-right-column">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      );
    }

    const vibeTags = getWineryVibeTags(winery);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 overflow-y-auto max-h-[85vh]" ref={scrollContainerRef}>
        {/* Left Column: Info & Details */}
        <div className="flex flex-col" data-testid="modal-left-column">
          <div className="relative h-56 w-full overflow-hidden bg-muted rounded-tl-xl">
            <HeroPhotoCarousel 
              winery={winery} 
              isFull={true} 
              isMobile={false} 
              onPhotoClick={setLightboxPhoto} 
            />
          </div>

          <div className="px-6 pb-6 space-y-4 flex flex-col flex-1 relative">
            {/* Translucent overlay title card */}
            <div className="-mt-12 mx-auto relative z-10 bg-background/70 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex flex-col items-center gap-1.5 text-center w-[92%] max-w-sm">
              <h2 className="text-xl md:text-2xl font-bold text-foreground leading-tight text-balance break-words w-full line-clamp-2">{winery.name}</h2>
              <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs md:text-[13px] text-muted-foreground font-medium w-full">
                {winery.rating && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Star className="w-3.5 h-3.5 md:w-4 md:h-4 fill-foreground text-foreground" />
                    <span className="text-foreground">{winery.rating}</span>
                    <span className="px-1 text-muted-foreground/40">|</span>
                  </div>
                )}
                <span className="text-balance break-words line-clamp-2">{winery.address}</span>
              </div>
            </div>
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
                className="inline-flex items-center self-start rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-semibold bg-[#f17e3a] hover:bg-[#f17e3a]/90 text-white cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm"
                onClick={() => onTripBadgeClick(winery.trip_id!)}
              >
                <Clock className="w-3 h-3 mr-1" />
                On Trip: {winery.trip_name}
              </div>
            )}

            <WineryActionsPresentational 
              winery={winery} 
              onLogVisit={onLogVisit}
              onStreetView={onStreetView}
              onToggleWishlist={onToggleWishlist}
              onToggleFavorite={onToggleFavorite}
              onToggleFavoritePrivacy={onToggleFavoritePrivacy}
              onToggleWishlistPrivacy={onToggleWishlistPrivacy}
            />

            {/* Outdoor Weather Widget */}
            {winery.latitude && winery.longitude && (
              <div className="flex justify-center">
                <WineryWeatherWidget latitude={winery.latitude} longitude={winery.longitude} />
              </div>
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

            <WineryDetails winery={winery} loadingWineryId={loadingWineryId} mode="info" />
          </div>
        </div>

        {/* Right Column: Interaction Tabs */}
        <div className="p-6 space-y-4 flex flex-col border-l border-border/50" data-testid="modal-right-column">
          {renderTabsList()}
          <div className="flex-1 overflow-y-auto pr-1">
            {renderActiveTabContent()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="winery-modal-dialog"
        data-state={isLoading ? "loading" : "ready"}
        className="fixed left-[50%] top-[50%] z-50 -translate-x-1/2 -translate-y-1/2 max-w-4xl w-[95vw] max-h-[85vh] p-0 flex flex-col overflow-hidden backdrop-blur-md bg-background border border-border/50 shadow-2xl shadow-primary/5 rounded-xl"
        onFocusOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{winery?.name || "Winery Details"}</DialogTitle>
          <DialogDescription>
            Detailed split view and interaction panel for {winery?.name || "selected winery"}.
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
        <PhotoLightboxModal
          winery={winery}
          photoRef={lightboxPhoto}
          onClose={() => setLightboxPhoto(null)}
          onPhotoSelect={setLightboxPhoto}
        />
      </DialogContent>
    </Dialog>
  );
}

export default DesktopWineryModal;
