// components/winery-modal.tsx
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Separator } from "./ui/separator";
import { Clock, Calendar as CalendarIcon } from "lucide-react";
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
import TripPlannerSection from "./TripPlannerSection";
import VisitCardHistory from "./VisitCardHistory";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { Skeleton } from "@/components/ui/skeleton";
import { useMapStore } from "@/lib/stores/mapStore";
import { Button } from "./ui/button";

export default function WineryModal() {
  const { isWineryModalOpen, activeWineryId, closeWineryModal, openVisitForm } = useUIStore();
  const { toast } = useToast();
  const { fetchTripById, setSelectedTrip } = useTripStore();
  const { map } = useMapStore();

  const [activeTab, setActiveTab] = useState<"community" | "amenities" | "visits" | "trip">("community");
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
    <div className="flex border-b border-border/50 w-full" role="tablist">
      {[
        { id: "community", label: "Community" },
        { id: "amenities", label: "Amenities" },
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
            className={`flex-1 text-center py-2 text-sm font-semibold border-b-2 transition-all duration-300 ${
              isActive 
                ? "border-primary text-primary" 
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
      case "visits":
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4" />
                <span>Your Visits</span>
              </h3>
              <Button 
                size="sm"
                data-testid="add-visit-button" 
                onClick={() => openVisitForm(activeWinery)}
                className="transition-all duration-300 hover:scale-105 active:scale-98"
              >
                + Log Visit
              </Button>
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
        <div className="grid grid-cols-2 gap-6 p-6 h-[500px]">
          <div className="space-y-4" data-testid="modal-left-column">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
          <div className="space-y-4" data-testid="modal-right-column">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-y-auto max-h-[85vh]" ref={scrollContainerRef}>
        {/* Left Column: Info & Details */}
        <div className="space-y-4 flex flex-col" data-testid="modal-left-column">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-foreground tracking-tight pr-4">{activeWinery.name}</h2>
              {activeWinery.trip_name && activeWinery.trip_date && activeWinery.trip_id && (
                <div
                  data-testid="trip-badge"
                  className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-[#f17e3a] hover:bg-[#f17e3a]/90 text-white cursor-pointer transition-colors"
                  onClick={() => handleTripBadgeClick(activeWinery.trip_id!)}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  On Trip: {activeWinery.trip_name}
                </div>
              )}
            </div>
          </div>

          <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="info" />
          
          <div className="border-t border-border/50 pt-4 mt-auto">
            <WineryActionsPresentational 
              winery={activeWinery} 
              onLogVisit={() => openVisitForm(activeWinery)}
              onStreetView={handleStreetViewClick}
              onToggleWishlist={handleWishlistToggle}
              onToggleFavorite={handleFavoriteToggle}
              onToggleFavoritePrivacy={handleToggleFavoritePrivacy}
              onToggleWishlistPrivacy={handleToggleWishlistPrivacy}
            />
          </div>
        </div>

        {/* Right Column: Interaction Tabs */}
        <div className="space-y-4 flex flex-col border-l border-border/50 pl-6" data-testid="modal-right-column">
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
        <div className="p-4 space-y-4 h-[400px]">
          <Skeleton className="h-6 w-1/2 mx-auto" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      );
    }

    return (
      <div className="p-4 space-y-4 overflow-y-auto max-h-[85vh] pb-8" ref={scrollContainerRef}>
        <div className="flex flex-col gap-2 text-center items-center">
          <h2 className="text-xl font-bold text-foreground">{activeWinery.name}</h2>
          {activeWinery.trip_name && activeWinery.trip_date && activeWinery.trip_id && (
            <div
              data-testid="trip-badge"
              className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-[#f17e3a] hover:bg-[#f17e3a]/90 text-white cursor-pointer transition-colors"
              onClick={() => handleTripBadgeClick(activeWinery.trip_id!)}
            >
              <Clock className="w-3 h-3 mr-1" />
              On Trip: {activeWinery.trip_name}
            </div>
          )}
        </div>

        <WineryDetails winery={activeWinery} loadingWineryId={loadingWineryId} mode="info" />

        <Separator className="border-border/50" />

        <WineryActionsPresentational 
          winery={activeWinery} 
          onLogVisit={() => openVisitForm(activeWinery)}
          onStreetView={handleStreetViewClick}
          onToggleWishlist={handleWishlistToggle}
          onToggleFavorite={handleFavoriteToggle}
          onToggleFavoritePrivacy={handleToggleFavoritePrivacy}
          onToggleWishlistPrivacy={handleToggleWishlistPrivacy}
        />

        <Separator className="border-border/50" />

        <div className="space-y-4">
          {renderTabsList()}
          <div className="pt-2">
            {renderActiveTabContent()}
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
          data-state={isLoading ? "loading" : "ready"}
          className="backdrop-blur-md bg-background/95 border-t border-border/50 shadow-2xl shadow-primary/5 rounded-t-[20px]"
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
        className="max-w-4xl w-[95vw] max-h-[85vh] p-0 flex flex-col overflow-hidden backdrop-blur-md bg-background/95 border border-border/50 shadow-2xl shadow-primary/5 rounded-xl"
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