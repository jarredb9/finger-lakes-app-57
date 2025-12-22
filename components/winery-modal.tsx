// components/winery-modal.tsx
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "./ui/separator";
import { Clock, Calendar as CalendarIcon } from "lucide-react";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/lib/types";
import { useTripStore } from "@/lib/stores/tripStore";

import WineryDetails from "./WineryDetails";
import WineryActions from "./WineryActions";
import FriendActivity from "./FriendActivity";
import FriendRatings from "./FriendRatings";
import TripPlannerSection from "./TripPlannerSection";
import VisitCardHistory from "./VisitCardHistory";
import VisitForm from "./VisitForm";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore"; // Import DataStore
import { useFriendStore } from "@/lib/stores/friendStore";
import { Skeleton } from "@/components/ui/skeleton";

export default function WineryModal() {
  const { isWineryModalOpen, activeWineryId, closeWineryModal } = useUIStore();
  const { toast } = useToast();
  const { fetchTripById, setSelectedTrip } = useTripStore();
  
  // Subscribe directly to DataStore for reactive updates
  const activeWinery = useWineryDataStore((state) =>
    activeWineryId ? state.persistentWineries.find((w) => w.id === activeWineryId) : null
  );
  
  const loadingWineryId = useWineryStore((state) => state.loadingWineryId); // Get loading state
  const { deleteVisit: deleteVisitAction } = useVisitStore();
  const { friendsRatings } = useFriendStore();

  const isLoading = loadingWineryId === activeWineryId; // Check if THIS winery is loading
  const visits = activeWinery?.visits || [];

  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const visitHistoryRef = useRef<HTMLDivElement>(null);
  const visitFormRef = useRef<HTMLDivElement>(null);

  const prevVisitsLength = useRef(visits.length);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditingVisitId(null);
    setPhotosToDelete([]);
    
    // Reset scroll to top when modal opens or when it finishes loading
    if (isWineryModalOpen && !isLoading) {
      // Use requestAnimationFrame to ensure the DOM is ready
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
      });
    }
  }, [isWineryModalOpen, activeWineryId, isLoading]);

  useEffect(() => {
    // Only scroll to history if the modal is already open and NOT in a loading state
    // when the visits length increases. This prevents hydration from triggering the scroll.
    if (isWineryModalOpen && !isLoading && visits.length > prevVisitsLength.current) {
      // Small delay to ensure the new visit card is rendered
      setTimeout(() => {
        visitHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
    prevVisitsLength.current = visits.length;
  }, [visits.length, isWineryModalOpen, isLoading]);

  if (!isWineryModalOpen) {
    return null;
  }

  const handleTogglePhotoForDeletion = (photoPath: string) => {
    setPhotosToDelete(prev => 
      prev.includes(photoPath) 
        ? prev.filter(p => p !== photoPath)
        : [...prev, photoPath]
    );
  };

  const handleEditClick = (visit: Visit) => {
    if (!visit.id) return;
    setEditingVisitId(String(visit.id));
    setTimeout(() => {
      visitFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!deleteVisitAction || !visitId) return;
    try {
      await deleteVisitAction(visitId);
      toast({ description: "Visit deleted successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete visit.";
      toast({ variant: "destructive", description: message });
    }
  };

  const handleCancelEdit = () => {
    setEditingVisitId(null);
    visitHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const editingVisit = editingVisitId ? visits.find((v) => v.id === editingVisitId) : null;

  const handleTripBadgeClick = async (tripId: number) => {
    closeWineryModal(); // Close the winery modal first
    await fetchTripById(tripId.toString());
    const updatedTrip = useTripStore.getState().trips.find((t) => t.id === tripId);
    if (updatedTrip) {
      setSelectedTrip(updatedTrip);
      toast({ description: `Map updated to show trip: ${updatedTrip.name}` });
    } else {
      toast({ variant: "destructive", description: "Failed to load trip details." });
    }
  };

  return (
    <Dialog open={isWineryModalOpen} onOpenChange={closeWineryModal}>
      <DialogContent
        className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col"
        onFocusOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="overflow-y-auto" ref={scrollContainerRef} key={activeWineryId || 'none'}>
          {isLoading || !activeWinery ? (
            <div className="p-6 space-y-4">
              <DialogHeader>
                <DialogTitle>
                  <Skeleton className="h-8 w-3/4" />
                </DialogTitle>
              </DialogHeader>
              <DialogDescription className="sr-only">Loading winery details...</DialogDescription>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
              <Separator className="my-4" />
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Separator className="my-4" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              <div className="p-6">
                <DialogHeader>
                    <div className="flex flex-col-reverse sm:flex-row justify-between items-start gap-4">
                        <div className="flex items-center gap-2">
                            <DialogTitle className="text-2xl pr-4">{activeWinery.name}</DialogTitle>
                            {activeWinery.trip_name && activeWinery.trip_date && activeWinery.trip_id && (
                                <div
                                    className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-[#f17e3a] hover:bg-[#f17e3a]/90 cursor-pointer"
                                    onClick={() => handleTripBadgeClick(activeWinery.trip_id!)}
                                >
                                    <Clock className="w-3 h-3 mr-1" />
                                    On Trip: {activeWinery.trip_name}
                                </div>
                            )}
                        </div>
                        <WineryActions winery={activeWinery} />
                    </div>
                    <WineryDetails winery={activeWinery} />
                </DialogHeader>
                <Separator className="my-4" />

                {activeWinery.dbId && <FriendActivity wineryDbId={activeWinery.dbId} />}
                {friendsRatings.length > 0 && <FriendRatings />}

                <TripPlannerSection winery={activeWinery} onClose={closeWineryModal} />

                <Separator className="my-4" />

                <div className="space-y-4" ref={visitHistoryRef}>
                  <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
                    <CalendarIcon className="w-5 h-5" />
                    <span>Your Visits</span>
                  </h3>
                  {visits.length > 0 ? (
                    <VisitCardHistory visits={visits} editingVisitId={editingVisitId} onEditClick={handleEditClick} onDeleteVisit={handleDeleteVisit} onTogglePhotoForDeletion={handleTogglePhotoForDeletion} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{activeWinery.userVisited ? "You haven't reviewed any visits here yet." : "You haven't visited this winery yet."}</p>
                  )}
                </div>
              </div>
              <VisitForm 
                ref={visitFormRef} 
                winery={activeWinery} 
                editingVisit={editingVisit || null} 
                onCancelEdit={handleCancelEdit} 
                photosToDelete={photosToDelete} 
                togglePhotoForDeletion={handleTogglePhotoForDeletion}
                setPhotosToDelete={setPhotosToDelete}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}