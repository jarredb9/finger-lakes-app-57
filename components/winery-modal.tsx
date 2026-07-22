// components/winery-modal.tsx
import { useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

import { Clock, Calendar as CalendarIcon, Star, Pencil, X } from "lucide-react";
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
import { getWineryVibeTags } from "@/lib/utils/winery";



export default function WineryModal() {
  const { isWineryModalOpen, activeWineryId, closeWineryModal, openVisitForm } = useUIStore();
  const { toast } = useToast();
  const { fetchTripById, setSelectedTrip } = useTripStore();
  
  const [snapPoint, setSnapPoint] = useState<string | number | null>("300px");
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const prevActiveWineryRef = useRef<string | null>(null);

  useEffect(() => {
    if (isWineryModalOpen) {
      if (activeWineryId !== prevActiveWineryRef.current) {
        console.log(`[DRAWER-DIAGNOSTIC] Modal opened for winery ${activeWineryId}. Initializing snapPoint to 300px.`);
        prevActiveWineryRef.current = activeWineryId;
        setSnapPoint("300px");
      }
    } else {
      prevActiveWineryRef.current = null;
    }
  }, [isWineryModalOpen, activeWineryId]);

  const { map } = useMapStore();

  const [activeTab, setActiveTab] = useState<"community" | "amenities" | "ai_insights" | "varietals" | "visits" | "trip">("community");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
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
  
  const activeWinery = useWineryDataStore((state) => {
    if (!activeWineryId) return null;
    return (
      state.persistentWineries.find(
        (w) =>
          w.id === activeWineryId ||
          String(w.dbId) === String(activeWineryId) ||
          w.googleId === activeWineryId
      ) || null
    );
  });

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

function HeroPhotoCarousel({ 
  winery, 
  isMobile, 
  onPhotoClick,
  initialPhotoRef
}: { 
  winery: any; 
  isFull?: boolean; 
  isMobile?: boolean; 
  onPhotoClick?: (photoRef: string) => void;
  initialPhotoRef?: string | null;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const photos: string[] = winery?.photo_references?.length
    ? winery.photo_references
    : winery?.primary_photo_reference
    ? [winery.primary_photo_reference]
    : [];

  const initialIndexRef = useRef(initialPhotoRef ? Math.max(0, photos.indexOf(initialPhotoRef)) : 0);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    startIndex: initialIndexRef.current,
    watchSlides: true
  });

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setCurrentIndex(emblaApi.selectedScrollSnap());
    };

    emblaApi.on("select", onSelect);
    setCurrentIndex(emblaApi.selectedScrollSnap());

    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const lastPhotoRef = useRef<string | null>(null);

  useEffect(() => {
    if (emblaApi && initialPhotoRef && initialPhotoRef !== lastPhotoRef.current) {
      lastPhotoRef.current = initialPhotoRef;
      const idx = photos.indexOf(initialPhotoRef);
      if (idx !== -1) {
        emblaApi.scrollTo(idx, true);
      }
    }
  }, [emblaApi, initialPhotoRef, photos]);

  if (!photos.length) {
    return <div className="h-full w-full bg-gradient-to-r from-muted/30 to-muted/10" />;
  }

  // Render a single static image on mobile viewports to prevent horizontal vs vertical swipe gesture conflicts
  if (isMobile) {
    return (
      <div 
        className="relative h-full w-full overflow-hidden cursor-pointer"
        onClick={() => onPhotoClick?.(photos[0])}
      >
        <WineryImage
          photoRef={photos[0]}
          winery={winery}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          alt={`${winery.name} hero photo`}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full group overflow-hidden pointer-events-auto">
      <div className="overflow-hidden h-full w-full" ref={emblaRef}>
        <div className="flex h-full w-full">
          {photos.map((ref, idx) => (
            <div 
              key={ref || idx} 
              className="h-full w-full shrink-0 relative cursor-pointer flex-[0_0_100%] min-w-0"
              onClick={() => onPhotoClick?.(ref)}
            >
              <WineryImage
                photoRef={ref}
                winery={winery}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                alt={`${winery.name} photo ${idx + 1}`}
              />
            </div>
          ))}
        </div>
      </div>

      {photos.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md">
          {photos.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to photo ${idx + 1}`}
              onClick={() => emblaApi && emblaApi.scrollTo(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentIndex === idx ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
    const isPeek = snapPoint === "300px";
    const isFull = snapPoint === "100%" || snapPoint === 1;
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

        {/* Translucent Floating Title Card (Tappable to cycle snap points) */}
        <div 
          onClick={() => {
            const nextSnap = snapPoint === "300px" ? "520px" : snapPoint === "520px" ? "100%" : "300px";
            console.log(`[DRAWER-DIAGNOSTIC] Header title card tapped! Transitioning snapPoint from ${snapPoint} to ${nextSnap}`);
            setSnapPoint(nextSnap);
          }}
          className={`px-4 relative z-20 cursor-pointer -mt-10`}
        >
          <div className="bg-background/85 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl p-3 sm:p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex flex-col items-center gap-1 text-center max-w-sm mx-auto">
            <h2 className="text-lg sm:text-xl font-bold text-foreground leading-tight">{activeWinery.name}</h2>
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium">
              {activeWinery.rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-foreground text-foreground" />
                  <span className="text-foreground font-semibold">{activeWinery.rating}</span>
                  <span className="px-1 text-muted-foreground/40">|</span>
                </div>
              )}
              <span className="line-clamp-1">{activeWinery.address}</span>
            </div>
          </div>
        </div>

        {/* Peek Primary Action Bar (Directions + Log Visit) */}
        <div className={`px-4 pt-2.5 pb-1.5 flex items-center gap-3 shrink-0 ${isPeek ? "flex" : "hidden"}`}>
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

        <div 
          ref={scrollContainerRef}
          className={`flex-1 flex flex-col min-h-0 scrollbar-none ${isFull ? "overflow-y-auto pb-10" : "overflow-hidden pb-4"} ${isPeek ? "hidden" : "flex"}`}
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
            <button
              type="button"
              data-testid="log-visit-button"
              onClick={() => openVisitForm(activeWinery)}
              className={`w-full py-3 px-4 rounded-xl bg-[#6B1536] hover:bg-[#58102b] text-white font-bold text-sm transition-all duration-200 shadow-md items-center justify-center gap-2 active:scale-98 ${isPeek ? "hidden" : "flex"}`}
            >
              <Pencil className="w-4 h-4" />
              <span>Log Visit</span>
            </button>

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
          setActiveSnapPoint={setSnapPoint}
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
            {renderMobileLayout()}
          </DrawerContent>
        </Drawer>
        {lightboxPhoto && (
          <div 
            className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            data-testid="photo-lightbox-modal"
            onClick={() => setLightboxPhoto(null)}
          >
            <div className="relative max-w-3xl h-[70vh] w-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                data-testid="close-lightbox-button"
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-4 right-4 z-[110] p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                aria-label="Close Lightbox"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="h-full w-full overflow-hidden rounded-lg">
                <HeroPhotoCarousel
                  winery={activeWinery!}
                  isFull={true}
                  isMobile={false}
                  initialPhotoRef={lightboxPhoto}
                />
              </div>
            </div>
          </div>
        )}
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
        </DialogContent>
      </Dialog>
      {lightboxPhoto && (
        <div 
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          data-testid="photo-lightbox-modal"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="relative max-w-3xl h-[70vh] w-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              data-testid="close-lightbox-button"
              onClick={() => setLightboxPhoto(null)}
              className="absolute top-4 right-4 z-[110] p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
              aria-label="Close Lightbox"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="h-full w-full overflow-hidden rounded-lg">
              <HeroPhotoCarousel
                winery={activeWinery!}
                isFull={true}
                isMobile={false}
                initialPhotoRef={lightboxPhoto}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}