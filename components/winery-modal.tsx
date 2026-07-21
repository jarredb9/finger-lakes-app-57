// components/winery-modal.tsx
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

import { Clock, Calendar as CalendarIcon, Star } from "lucide-react";
import { WineryImage } from "./WineryDetails";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";
import { shallow } from "zustand/shallow";

import WineryDetails from "./WineryDetails";
import WineryActionsPresentational from "./WineryActionsPresentational";
import WineryCommunityTab from "./WineryCommunityTab";
import WineryVarietalsTab from "./WineryVarietalsTab";
import { WineryWeatherWidget } from "./WineryWeatherWidget";
import TripPlannerSection from "./TripPlannerSection";
import VisitCardHistory from "./VisitCardHistory";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { Skeleton } from "@/components/ui/skeleton";
import { useMapStore } from "@/lib/stores/mapStore";
import { isOpenNow } from "@/lib/utils/opening-hours";
import { MapNavigation } from "./MapNavigation";
import { Navigation } from "lucide-react";


export default function WineryModal() {
  const { isWineryModalOpen, activeWineryId, closeWineryModal, openVisitForm } = useUIStore();
  const { toast } = useToast();
  const { fetchTripById, setSelectedTrip } = useTripStore();
  
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop > 0) {
      return;
    }
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;
    if (deltaY > 0) {
      setDragOffset(deltaY);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragOffset > 100) {
      closeWineryModal();
    }
    setDragOffset(0);
  };
  const { map } = useMapStore();

  const [activeTab, setActiveTab] = useState<"community" | "amenities" | "ai_insights" | "varietals" | "visits" | "trip">("community");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 640 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleStreetViewClick = () => {
    if (!activeWinery) return;
    
    if (map && typeof map.openStreetView === "function") {
      map.openStreetView(activeWinery.latitude, activeWinery.longitude);
    } else {
      const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${activeWinery.latitude},${activeWinery.longitude}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const { toggleWishlist, toggleFavorite, toggleFavoritePrivacy, toggleWishlistPrivacy } = useWineryStore(
    (state) => ({
      toggleWishlist: state.toggleWishlist,
      toggleFavorite: state.toggleFavorite,
      toggleFavoritePrivacy: state.toggleFavoritePrivacy,
      toggleWishlistPrivacy: state.toggleWishlistPrivacy,
    }),
    shallow
  );
  
  const activeWinery = useWineryDataStore((state) =>
    activeWineryId ? state.persistentWineries.find((w) => w.id === activeWineryId) : null
  );

  const handleWishlistToggle = async () => {
    if (!activeWinery) return;
    try {
      await toggleWishlist(activeWinery);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update wishlist." });
    }
  };

  const handleFavoriteToggle = async () => {
    if (!activeWinery) return;
    try {
      await toggleFavorite(activeWinery);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update favorites." });
    }
  };

  const handleToggleFavoritePrivacy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWinery) return;
    try {
        await toggleFavoritePrivacy(activeWinery.id);
        toast({ description: activeWinery.favoriteIsPrivate ? "Favorite is now public." : "Favorite is now private." });
    } catch (error) {
        toast({ variant: "destructive", description: "Failed to update favorite privacy." });
    }
  };

  const handleToggleWishlistPrivacy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWinery) return;
    try {
        await toggleWishlistPrivacy(activeWinery.id);
        toast({ description: activeWinery.wishlistIsPrivate ? "Wishlist item is now public." : "Wishlist item is now private." });
    } catch (error) {
        toast({ variant: "destructive", description: "Failed to update wishlist privacy." });
    }
  };
  
  const loadingWineryId = useWineryStore((state) => state.loadingWineryId);
  const { deleteVisit: deleteVisitAction } = useVisitStore();
  
  const storeVisits = useVisitStore((state) => 
    activeWineryId ? state.visits.filter(v => v.wineryId === activeWineryId || v.wineries?.google_place_id === activeWineryId) : []
  );

  const isLoading = loadingWineryId === activeWineryId;
  
  const wineryVisits = activeWinery?.visits || [];
  const visits = [
    ...storeVisits,
    ...wineryVisits.filter(wv => !storeVisits.some(sv => String(sv.id) === String(wv.id)))
  ].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const visitHistoryRef = useRef<HTMLDivElement>(null);

  const prevVisitsLength = useRef(visits.length);
  const hasHydrated = useRef(false);

  useEffect(() => {
    hasHydrated.current = false;
  }, [isWineryModalOpen, activeWineryId]);

  useEffect(() => {
    if (isLoading || !isWineryModalOpen) {
      prevVisitsLength.current = visits.length;
    }

    if (isWineryModalOpen && !isLoading) {
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
      });
    }
  }, [isWineryModalOpen, activeWineryId, isLoading, visits.length]);

  useEffect(() => {
    if (!isWineryModalOpen) return undefined;

    if (!hasHydrated.current) {
      if (!isLoading) {
        hasHydrated.current = true;
        prevVisitsLength.current = visits.length;
      }
      return undefined;
    }

    if (!isLoading && visits.length > prevVisitsLength.current) {
      const timer = setTimeout(() => {
        if (visitHistoryRef.current) {
          visitHistoryRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
      
      prevVisitsLength.current = visits.length;
      return () => clearTimeout(timer);
    }
    
    prevVisitsLength.current = visits.length;
    return undefined;
  }, [visits.length, isWineryModalOpen, isLoading]);

  const isStreetViewActive = useMapStore((state) => state.isStreetViewActive);

  if (!isWineryModalOpen || isStreetViewActive) {
    return null;
  }

  const handleEditClick = (visit: Visit) => {
    if (!visit.id || !activeWinery) return;
    openVisitForm(activeWinery, visit);
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!deleteVisitAction || !visitId) return;
    try {
      await deleteVisitAction(visitId);
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      toast({ 
        description: isOffline 
          ? "Deletion cached. It will be synced once you're back online." 
          : "Visit deleted successfully." 
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete visit.";
      toast({ variant: "destructive", description: message });
    }
  };

  const handleTripBadgeClick = async (tripId: number) => {
    closeWineryModal();
    
    setTimeout(async () => {
        await fetchTripById(tripId.toString());
        const updatedTrip = useTripStore.getState().trips.find((t) => t.id === tripId);
        if (updatedTrip) {
          setSelectedTrip(updatedTrip);
          toast({ description: `Map updated to show trip: ${updatedTrip.name}` });
        } else {
          toast({ variant: "destructive", description: "Failed to load trip details." });
        }
    }, 100);
  };

  const renderTabsList = () => (
    <div className="flex border-b border-border/50 w-full overflow-x-auto scrollbar-none flex-nowrap justify-between" role="tablist">
      {[
        { id: "community", label: "Community" },
        { id: "amenities", label: "Amenities" },
        { id: "ai_insights", label: "AI Insights" },
        { id: "varietals", label: "Varietals" },
        { id: "visits", label: "Visits" },
        { id: "trip", label: "Trip" }
      ].map((t) => {
        const isActive = activeTab === t.id;
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
    switch (activeTab) {
      case "community":
        return <WineryCommunityTab wineryDbId={activeWinery.dbId ?? null} />;
      case "amenities":
        return <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="logistics" />;
      case "ai_insights":
        return <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="ai_insights" />;
      case "varietals":
        return (
          <WineryVarietalsTab 
            varietals={activeWinery.varietals ?? undefined} 
            vibeTags={activeWinery.vibe_tags ?? undefined} 
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

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 overflow-y-auto max-h-[85vh]" ref={scrollContainerRef}>
        {/* Left Column: Info & Details */}
        <div className="flex flex-col" data-testid="modal-left-column">
          <div className="relative h-56 w-full overflow-hidden bg-muted rounded-tl-xl">
            {activeWinery.primary_photo_reference ? (
              <WineryImage
                photoRef={activeWinery.primary_photo_reference}
                winery={activeWinery}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                alt={`${activeWinery.name} hero photo`}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-muted/30 to-muted/10" />
            )}
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
        <div className="flex flex-col h-[400px] overflow-hidden pb-8">
          <div className="relative h-44 w-full bg-muted animate-pulse">
            <div className="absolute bottom-0 left-0 right-0 bg-background/60 backdrop-blur-md p-3 border-t border-border/30 space-y-2">
              <div className="h-5 bg-muted rounded w-1/2" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        </div>
      );
    }

    const isOpen = isOpenNow(activeWinery.openingHours);

    return (
      <div className="overflow-y-auto max-h-[85vh] pb-8 flex flex-col" ref={scrollContainerRef}>
        {/* Peek bar status & action strip */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1 border-b border-border/20 bg-muted/20">
          <span
            data-testid="peek-open-status-tag"
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-background border border-border/50 shadow-2xs"
          >
            {isOpen ? "🟢 OPEN NOW" : "🔴 CLOSED"}
          </span>
          <div className="flex items-center gap-2">
            <MapNavigation
              address={activeWinery.address}
              wineryName={activeWinery.name}
              latitude={activeWinery.latitude}
              longitude={activeWinery.longitude}
            >
              <button
                type="button"
                data-testid="route-from-current"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border/50 bg-background text-xs font-semibold text-foreground hover:bg-muted/80"
              >
                <Navigation className="w-3.5 h-3.5 text-blue-500" />
                <span>Directions</span>
              </button>
            </MapNavigation>
            {activeWinery.latitude && activeWinery.longitude && (
              <WineryWeatherWidget latitude={activeWinery.latitude} longitude={activeWinery.longitude} />
            )}
          </div>
        </div>

        <div 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative cursor-ns-resize"
        >
          {/* Hero Image / Header Area */}
          <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-muted">
            <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-black/40 to-transparent pointer-events-none z-10" />
            {activeWinery.primary_photo_reference ? (
              <WineryImage
                photoRef={activeWinery.primary_photo_reference}
                winery={activeWinery}
                className="h-full w-full object-cover"
                alt={`${activeWinery.name} hero photo`}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-muted/30 to-muted/10" />
            )}
          </div>

          <div className="px-4 space-y-4 relative">
            {/* Translucent overlay title card */}
            <div className="-mt-10 mx-auto relative z-10 bg-background/80 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex flex-col items-center gap-1.5 text-center w-[92%] max-w-sm">
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
          </div>
        </div>

        <div className="px-4 pb-4 mt-4 space-y-4 relative">
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

          <WineryActionsPresentational 
            winery={activeWinery} 
            onLogVisit={() => openVisitForm(activeWinery)}
            onStreetView={handleStreetViewClick}
            onToggleWishlist={handleWishlistToggle}
            onToggleFavorite={handleFavoriteToggle}
            onToggleFavoritePrivacy={handleToggleFavoritePrivacy}
            onToggleWishlistPrivacy={handleToggleWishlistPrivacy}
          />

          <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="info" />

          <div className="space-y-4">
            {renderTabsList()}
            <div className="pt-2">
              {renderActiveTabContent()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isMobile) {
    return (
      <Drawer open={isWineryModalOpen} onOpenChange={(open) => !open && closeWineryModal()}>
        <DrawerContent 
          data-testid="winery-modal-drawer"
          data-snap-points="300px,550px,1"
          data-state={isLoading ? "loading" : "ready"}
          className="backdrop-blur-md bg-background border-t border-border/50 shadow-2xl shadow-primary/5 rounded-t-[20px] overflow-hidden p-0 gap-0"
          style={{
            transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
            transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <DrawerHeader className="sr-only">
            <DrawerTitle>{activeWinery?.name || "Winery Details"}</DrawerTitle>
            <DrawerDescription>
              Winery details for {activeWinery?.name || "selected winery"}.
            </DrawerDescription>
          </DrawerHeader>
          {renderMobileLayout()}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isWineryModalOpen} onOpenChange={closeWineryModal}>
      <DialogContent
        data-testid="winery-modal-dialog"
        data-state={isLoading ? "loading" : "ready"}
        className="max-w-4xl w-[95vw] max-h-[85vh] p-0 flex flex-col overflow-hidden backdrop-blur-md bg-muted/40 border border-border/50 shadow-2xl shadow-primary/5 rounded-xl"
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
      </DialogContent>
    </Dialog>
  );
}