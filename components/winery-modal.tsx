// components/winery-modal.tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

import { Clock, Calendar as CalendarIcon, Star, Pencil, ChevronUp, ChevronDown, Navigation } from "lucide-react";
import { WineryDetails } from "./WineryDetails";
import { HeroPhotoCarousel } from "./winery/hero-photo-carousel";
import { PhotoLightboxModal } from "./winery/photo-lightbox-modal";
import { useWineryModalState } from "./winery/use-winery-modal-state";

import { WineryActionsPresentational } from "./WineryActionsPresentational";
import { WineryCommunityTab } from "./WineryCommunityTab";
import { WineryVarietalsTab } from "./WineryVarietalsTab";
import { WineryWeatherWidget } from "./WineryWeatherWidget";
import TripPlannerSection from "./TripPlannerSection";
import VisitCardHistory from "./VisitCardHistory";
import { Skeleton } from "@/components/ui/skeleton";
import { isOpenNow } from "@/lib/utils/opening-hours";
import { MapNavigation } from "./MapNavigation";
import { getWineryVibeTags } from "@/lib/utils/winery";

export function WineryModal() {
  const {
    isWineryModalOpen,
    activeWinery,
    loadingWineryId,
    isLoading,
    isStreetViewActive,
    isMobile,
    isAIEnabled,
    lightboxPhoto,
    setLightboxPhoto,
    snapPoint,
    setSnapPoint,
    effectiveActiveTab,
    setActiveTab,
    visits,
    scrollContainerRef,
    visitHistoryRef,
    closeWineryModal,
    openVisitForm,
    handleStreetViewClick,
    handleWishlistToggle,
    handleFavoriteToggle,
    handleToggleFavoritePrivacy,
    handleToggleWishlistPrivacy,
    handleEditClick,
    handleDeleteVisit,
    handleTripBadgeClick,
  } = useWineryModalState();

  if (!isWineryModalOpen || isStreetViewActive) {
    return null;
  }

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
            onClick={() => setActiveTab(t.id as any)}
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
    if (!activeWinery) return null;
    switch (effectiveActiveTab) {
      case "community":
        return <WineryCommunityTab wineryDbId={activeWinery.dbId ?? null} />;
      case "amenities":
        return <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="logistics" />;
      case "ai_insights":
        return isAIEnabled ? (
          <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="ai_insights" />
        ) : (
          <WineryCommunityTab wineryDbId={activeWinery.dbId ?? null} />
        );
      case "varietals":
        return (
          <WineryVarietalsTab 
            varietals={activeWinery.varietals ?? undefined} 
            geminiTastingNotes={activeWinery.generative_summary ?? undefined} 
            reviews={activeWinery.reviews} 
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
                  onEditClick={handleEditClick} 
                  onDeleteVisit={handleDeleteVisit} 
                  onTogglePhotoForDeletion={() => {}} 
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                {activeWinery.userVisited ? "You haven't reviewed any visits here yet." : "You haven't visited this winery yet."}
              </p>
            )}
          </div>
        );
      case "trip":
        return <TripPlannerSection winery={activeWinery} onClose={closeWineryModal} />;
      default:
        return null;
    }
  };

  const renderDesktopLayout = () => {
    if (isLoading || !activeWinery) {
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

    const vibeTags = getWineryVibeTags(activeWinery);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 overflow-y-auto max-h-[85vh]" ref={scrollContainerRef}>
        {/* Left Column: Info & Details */}
        <div className="flex flex-col" data-testid="modal-left-column">
          <div className="relative h-56 w-full overflow-hidden bg-muted rounded-tl-xl">
            <HeroPhotoCarousel 
              winery={activeWinery} 
              isFull={true} 
              isMobile={false} 
              onPhotoClick={setLightboxPhoto} 
            />
          </div>

          <div className="px-6 pb-6 space-y-4 flex flex-col flex-1 relative">
            {/* Translucent overlay title card */}
            <div className="-mt-12 mx-auto relative z-10 bg-background/70 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex flex-col items-center gap-1.5 text-center w-[92%] max-w-sm">
              <h2 className="text-xl md:text-2xl font-bold text-foreground leading-tight text-balance break-words w-full line-clamp-2">{activeWinery.name}</h2>
              <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs md:text-[13px] text-muted-foreground font-medium w-full">
                {activeWinery.rating && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Star className="w-3.5 h-3.5 md:w-4 md:h-4 fill-foreground text-foreground" />
                    <span className="text-foreground">{activeWinery.rating}</span>
                    <span className="px-1 text-muted-foreground/40">|</span>
                  </div>
                )}
                <span className="text-balance break-words line-clamp-2">{activeWinery.address}</span>
              </div>
            </div>
            {activeWinery.trip_name && activeWinery.trip_date && activeWinery.trip_id && (
              <div
                data-testid="trip-badge"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTripBadgeClick(activeWinery.trip_id!);
                  }
                }}
                className="inline-flex items-center self-start rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-semibold bg-[#f17e3a] hover:bg-[#f17e3a]/90 text-white cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm"
                onClick={() => handleTripBadgeClick(activeWinery.trip_id!)}
              >
                <Clock className="w-3 h-3 mr-1" />
                On Trip: {activeWinery.trip_name}
              </div>
            )}

            <WineryActionsPresentational 
              winery={activeWinery} 
              onLogVisit={() => openVisitForm(activeWinery)}
              onStreetView={handleStreetViewClick}
              onToggleWishlist={handleWishlistToggle}
              onToggleFavorite={handleFavoriteToggle}
              onToggleFavoritePrivacy={handleToggleFavoritePrivacy}
              onToggleWishlistPrivacy={handleToggleWishlistPrivacy}
            />

            {/* Outdoor Weather Widget */}
            {activeWinery.latitude && activeWinery.longitude && (
              <div className="flex justify-center">
                <WineryWeatherWidget latitude={activeWinery.latitude} longitude={activeWinery.longitude} />
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

            <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="info" />
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

  const renderMobileLayout = () => {
    if (isLoading || !activeWinery) {
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

    const isOpen = isOpenNow(activeWinery.openingHours);
    const isFull = snapPoint === "100%" || snapPoint === 1 || snapPoint === "1" || (typeof window !== "undefined" && !!(window as any)._E2E_FULL_DRAWER);
    const isPeek = !isFull && snapPoint === "300px";
    const isHalf = !isPeek && !isFull;

    const vibeTags = getWineryVibeTags(activeWinery);
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Pinned Header: Flush Top Hero Photo Carousel */}
        <div className="relative w-full shrink-0 bg-muted rounded-t-[20px] overflow-hidden">
          {/* Flush Hero Image Carousel with Height Scaling */}
          <div className={`relative w-full ${isPeek ? "h-48" : isHalf ? "h-40" : "h-56 sm:h-64"}`}>
            <HeroPhotoCarousel 
              winery={activeWinery} 
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
              <h2 className="text-lg sm:text-xl font-bold text-foreground leading-tight truncate">{activeWinery.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground font-medium mt-0.5">
                {activeWinery.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-foreground text-foreground" />
                    <span className="text-foreground font-semibold">{activeWinery.rating}</span>
                    <span className="px-1 text-muted-foreground/40">|</span>
                  </div>
                )}
                <span className="truncate">{activeWinery.address}</span>
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
                address={activeWinery.address}
                wineryName={activeWinery.name}
                latitude={activeWinery.latitude}
                longitude={activeWinery.longitude}
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
              onClick={() => openVisitForm(activeWinery)}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#6B1536] hover:bg-[#58102b] text-white text-sm font-bold transition-all shadow-md active:scale-98"
            >
              <Pencil className="w-4 h-4" />
              <span>Log Visit</span>
            </button>
          </div>
        )}

        <div 
          ref={scrollContainerRef}
          className={`flex-1 flex flex-col min-h-0 scrollbar-none ${isFull ? "overflow-y-auto pb-10" : "overflow-hidden pb-4"} flex`}
        >
          <div className="px-4 mt-2.5 space-y-2.5">
            {/* 4-Grid Quick Action Tiles */}
            <WineryActionsPresentational 
              winery={activeWinery} 
              onLogVisit={() => openVisitForm(activeWinery)}
              onStreetView={handleStreetViewClick}
              onToggleWishlist={handleWishlistToggle}
              onToggleFavorite={handleFavoriteToggle}
              onToggleFavoritePrivacy={handleToggleFavoritePrivacy}
              onToggleWishlistPrivacy={handleToggleWishlistPrivacy}
              showLogVisit={false}
            />

            {/* Outdoor Weather Widget */}
            {activeWinery.latitude && activeWinery.longitude && (
              <div className="flex justify-center">
                <WineryWeatherWidget latitude={activeWinery.latitude} longitude={activeWinery.longitude} />
              </div>
            )}

            {/* Prominent Full-Width Log Visit CTA Button */}
            {!isPeek && (
              <button
                type="button"
                data-testid="log-visit-button"
                onClick={() => openVisitForm(activeWinery)}
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
            {activeWinery.trip_name && activeWinery.trip_date && activeWinery.trip_id && (
              <div
                data-testid="trip-badge"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTripBadgeClick(activeWinery.trip_id!);
                  }
                }}
                className="inline-flex items-center rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-semibold bg-[#f17e3a] hover:bg-[#f17e3a]/90 text-white cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm"
                onClick={() => handleTripBadgeClick(activeWinery.trip_id!)}
              >
                <Clock className="w-3 h-3 mr-1" />
                On Trip: {activeWinery.trip_name}
              </div>
            )}

            {/* Contact Overview Card */}
            <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="info" />

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

  if (isMobile) {
    return (
      <>
        <Drawer 
          open={isWineryModalOpen} 
          onOpenChange={(open) => !open && closeWineryModal()}
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
              <DrawerTitle>{activeWinery?.name || "Winery Details"}</DrawerTitle>
              <DrawerDescription>
                Winery details for {activeWinery?.name || "selected winery"}.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" data-testid="drawer-scroll-container">
              {renderMobileLayout()}
            </div>
            <PhotoLightboxModal
              winery={activeWinery}
              photoRef={lightboxPhoto}
              onClose={() => setLightboxPhoto(null)}
              onPhotoSelect={setLightboxPhoto}
            />
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <Dialog open={isWineryModalOpen} onOpenChange={closeWineryModal}>
        <DialogContent
          data-testid="winery-modal-dialog"
          data-state={isLoading ? "loading" : "ready"}
          className="fixed left-[50%] top-[50%] z-50 -translate-x-1/2 -translate-y-1/2 max-w-4xl w-[95vw] max-h-[85vh] p-0 flex flex-col overflow-hidden backdrop-blur-md bg-background border border-border/50 shadow-2xl shadow-primary/5 rounded-xl"
          onFocusOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{activeWinery?.name || "Winery Details"}</DialogTitle>
            <DialogDescription>
              Detailed split view and interaction panel for {activeWinery?.name || "selected winery"}.
            </DialogDescription>
          </DialogHeader>
          {renderDesktopLayout()}
          <PhotoLightboxModal
            winery={activeWinery}
            photoRef={lightboxPhoto}
            onClose={() => setLightboxPhoto(null)}
            onPhotoSelect={setLightboxPhoto}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default WineryModal;