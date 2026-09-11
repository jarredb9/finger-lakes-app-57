import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
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

export interface DesktopWineryLayoutProps {
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

export interface DesktopWineryModalProps extends DesktopWineryLayoutProps {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

export function DesktopWineryLayout({
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
}: DesktopWineryLayoutProps) {
  if (isLoading || !winery) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 h-[500px] overflow-hidden">
        <div className="flex flex-col" data-testid="modal-left-column">
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
            <h2 className="text-xl md:text-2xl font-bold text-foreground leading-tight text-balance break-words w-full line-clamp-2">
              {winery.name}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs md:text-[13px] text-muted-foreground font-medium w-full">
              {typeof winery.rating === "number" && winery.rating > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <Star className="w-3.5 h-3.5 md:w-4 md:h-4 fill-foreground text-foreground" />
                  <span className="text-foreground">{winery.rating}</span>
                  <span className="px-1 text-muted-foreground/40">|</span>
                </div>
              )}
              <span className="text-balance break-words line-clamp-2">{winery.address}</span>
            </div>
          </div>

          <WineryTripBadge winery={winery} onTripBadgeClick={onTripBadgeClick} />

          <WineryActionsPresentational
            winery={winery}
            onLogVisit={onLogVisit}
            onStreetView={onStreetView}
            onToggleWishlist={onToggleWishlist}
            onToggleFavorite={onToggleFavorite}
            onToggleFavoritePrivacy={onToggleFavoritePrivacy}
            onToggleWishlistPrivacy={onToggleWishlistPrivacy}
          />

          {winery.latitude && winery.longitude && (
            <div className="flex justify-center">
              <WineryWeatherWidget latitude={winery.latitude} longitude={winery.longitude} />
            </div>
          )}

          <WineryVibeScroller winery={winery} />

          <WineryDetails winery={winery} loadingWineryId={loadingWineryId} mode="info" />
        </div>
      </div>

      {/* Right Column: Interaction Tabs */}
      <div className="p-6 space-y-4 flex flex-col border-l border-border/50" data-testid="modal-right-column">
        <WineryModalTabsList
          effectiveActiveTab={effectiveActiveTab}
          setActiveTab={setActiveTab}
          isAIEnabled={isAIEnabled}
          size="md"
        />
        <div className="flex-1 overflow-y-auto pr-1">
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
  );
}

export function DesktopWineryModal(props: DesktopWineryModalProps) {
  const {
    isOpen,
    onClose,
    winery,
    isLoading = false,
    lightboxPhoto = null,
    setLightboxPhoto = () => {},
    children,
  } = props;

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
        {children || <DesktopWineryLayout {...props} />}
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
