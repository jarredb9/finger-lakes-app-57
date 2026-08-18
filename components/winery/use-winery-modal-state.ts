import { useEffect, useRef, useState } from "react";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useToast } from "@/hooks/use-toast";
import { useAIFeaturesEnabled } from "@/hooks/use-ai-features";
import { Visit } from "@/lib/types";
import { shallow } from "zustand/shallow";

export type WineryModalTab = "community" | "amenities" | "ai_insights" | "varietals" | "visits" | "trip";

export function useWineryModalState() {
  const { isWineryModalOpen, activeWineryId, closeWineryModal: closeWineryModalRaw, openVisitForm } = useUIStore();
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const closeWineryModal = () => {
    setLightboxPhoto(null);
    closeWineryModalRaw();
  };

  const { toast } = useToast();
  const { fetchTripById, setSelectedTrip } = useTripStore();

  const [snapPoint, setSnapPoint] = useState<string | number | null>(() =>
    typeof window !== "undefined" && (window as any)._E2E_FULL_DRAWER ? 1 : "300px"
  );
  const [prevActiveWineryId, setPrevActiveWineryId] = useState<string | null>(null);

  if (isWineryModalOpen && activeWineryId !== prevActiveWineryId) {
    const defaultSnap = typeof window !== "undefined" && (window as any)._E2E_FULL_DRAWER ? 1 : "300px";
    setPrevActiveWineryId(activeWineryId);
    setSnapPoint(defaultSnap);
  } else if (!isWineryModalOpen && prevActiveWineryId !== null) {
    setPrevActiveWineryId(null);
    if (lightboxPhoto !== null) {
      setLightboxPhoto(null);
    }
  }

  const { map } = useMapStore();
  const isAIEnabled = useAIFeaturesEnabled();

  const [activeTab, setActiveTab] = useState<WineryModalTab>("community");
  const effectiveActiveTab: WineryModalTab = !isAIEnabled && activeTab === "ai_insights" ? "community" : activeTab;
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const { toggleWishlist, toggleFavorite, toggleFavoritePrivacy, toggleWishlistPrivacy } = useWineryStore(
    (state) => ({
      toggleWishlist: state.toggleWishlist,
      toggleFavorite: state.toggleFavorite,
      toggleFavoritePrivacy: state.toggleFavoritePrivacy,
      toggleWishlistPrivacy: state.toggleWishlistPrivacy,
    }),
    shallow
  );

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

  const handleStreetViewClick = () => {
    if (!activeWinery) return;

    if (map && typeof map.openStreetView === "function") {
      map.openStreetView(activeWinery.latitude, activeWinery.longitude);
    } else {
      const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${activeWinery.latitude},${activeWinery.longitude}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleWishlistToggle = async () => {
    if (!activeWinery) return;
    try {
      await toggleWishlist(activeWinery);
    } catch {
      toast({ variant: "destructive", description: "Failed to update wishlist." });
    }
  };

  const handleFavoriteToggle = async () => {
    if (!activeWinery) return;
    try {
      await toggleFavorite(activeWinery);
    } catch {
      toast({ variant: "destructive", description: "Failed to update favorites." });
    }
  };

  const handleToggleFavoritePrivacy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWinery) return;
    try {
      await toggleFavoritePrivacy(activeWinery.id);
      toast({ description: activeWinery.favoriteIsPrivate ? "Favorite is now public." : "Favorite is now private." });
    } catch {
      toast({ variant: "destructive", description: "Failed to update favorite privacy." });
    }
  };

  const handleToggleWishlistPrivacy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWinery) return;
    try {
      await toggleWishlistPrivacy(activeWinery.id);
      toast({ description: activeWinery.wishlistIsPrivate ? "Wishlist item is now public." : "Wishlist item is now private." });
    } catch {
      toast({ variant: "destructive", description: "Failed to update wishlist privacy." });
    }
  };

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
    setLightboxPhoto(null);

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

  return {
    isWineryModalOpen,
    activeWineryId,
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
    activeTab,
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
  };
}

export default useWineryModalState;
