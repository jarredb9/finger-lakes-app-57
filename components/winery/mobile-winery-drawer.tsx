import React from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Pencil, ChevronUp, ChevronDown, Navigation } from "lucide-react";
import { Winery, Visit } from "@/lib/types";
import { isOpenNow } from "@/lib/utils/opening-hours";
import { HeroPhotoCarousel } from "./hero-photo-carousel";
import { PhotoLightboxModal } from "./photo-lightbox-modal";
import { WineryModalTab } from "./use-winery-modal-state";
import { WineryModalTabsList, WineryModalTabContent } from "./winery-modal-tabs";
import { WineryTripBadge } from "./winery-trip-badge";
import { WineryVibeScroller } from "./winery-vibe-scroller";
import { WineryDetails } from "../WineryDetails";
import { WineryActionsPresentational } from "../WineryActionsPresentational";
import { WineryWeatherWidget } from "../WineryWeatherWidget";
import { MapNavigation } from "../MapNavigation";

export interface MobileWineryLayoutProps {
  winery: Winery | null;
  loadingWineryId?: string | null;
  isLoading?: boolean;
  isAIEnabled?: boolean;
  isMobile?: boolean;
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
}

export interface MobileWineryDrawerProps extends MobileWineryLayoutProps {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

export function MobileWineryLayout({
  winery,
  loadingWineryId = null,
  isLoading = false,
  isAIEnabled = false,
  isMobile = true,
  lightboxPhoto: _lightboxPhoto = null,
  setLightboxPhoto = () => {},
  snapPoint = "300px",
  setSnapPoint = () => {},
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
}: MobileWineryLayoutProps) {
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
              {typeof winery.rating === 'number' && winery.rating > 0 && (
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

          <WineryVibeScroller winery={winery} />

          <WineryTripBadge winery={winery} onTripBadgeClick={onTripBadgeClick} />

          {/* Contact Overview Card */}
          <WineryDetails winery={winery} loadingWineryId={loadingWineryId} mode="info" />

          {/* Interaction Tabs */}
          {isFull && (
            <div className="space-y-4 pt-2">
              <WineryModalTabsList
                effectiveActiveTab={effectiveActiveTab}
                setActiveTab={setActiveTab}
                isAIEnabled={isAIEnabled}
                size="md"
              />
              <div className="pt-2">
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
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileWineryDrawer(props: MobileWineryDrawerProps) {
  const {
    isOpen,
    onClose,
    winery,
    isLoading = false,
    snapPoint = "300px",
    setSnapPoint = () => {},
    lightboxPhoto = null,
    setLightboxPhoto = () => {},
    children,
  } = props;

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
          {children || <MobileWineryLayout {...props} />}
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
