
// components/winery-modal.tsx
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "./ui/separator";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar as CalendarIcon } from "lucide-react";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/lib/types";

import WineryDetails from "./WineryDetails";
import WineryActions from "./WineryActions";
import FriendActivity from "./FriendActivity";
import FriendRatings from "./FriendRatings";
import TripPlannerSection from "./TripPlannerSection";
import VisitHistory from "./VisitHistory";
import VisitForm from "./VisitForm";
import { useFriendStore } from "@/lib/stores/friendStore";

export default function WineryModal() {
  const { isWineryModalOpen, activeWineryId, closeWineryModal } = useUIStore();
  const { toast } = useToast();
  const activeWinery = useWineryStore((state) =>
    activeWineryId ? state.persistentWineries.find((w) => w.id === activeWineryId) : null
  );
  const { deleteVisit: deleteVisitAction } = useVisitStore();
  const { friendsRatings } = useFriendStore();

  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);
  const visitHistoryRef = useRef<HTMLDivElement>(null);
  const visitFormRef = useRef<HTMLDivElement>(null);

  const visits = activeWinery?.visits || [];
  const prevVisitsLength = useRef(visits.length);

  useEffect(() => {
    if (isWineryModalOpen) {
      setEditingVisitId(null);
    }
  }, [isWineryModalOpen]);

  useEffect(() => {
    if (visits.length > prevVisitsLength.current) {
      visitHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    prevVisitsLength.current = visits.length;
  }, [visits.length]);

  if (!isWineryModalOpen || !activeWinery) {
    return null;
  }

  const handleEditClick = (visit: Visit) => {
    if (!visit.id) return;
    setEditingVisitId(visit.id);
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

  const togglePhotoForDeletion = (photoPath: string) => {
    setPhotosToDelete((prev) =>
      prev.includes(photoPath) ? prev.filter((p) => p !== photoPath) : [...prev, photoPath]
    );
  };

  const editingVisit = editingVisitId ? visits.find((v) => v.id === editingVisitId) : null;

  return (
    <Dialog open={isWineryModalOpen} onOpenChange={closeWineryModal}>
      <DialogContent
        className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col"
        onPointerDownOutside={(e) => {
          if ((e.target as HTMLElement)?.closest("[vaul-drawer-trigger]")) {
            e.preventDefault();
          }
        }}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <div className="overflow-y-auto">
          <div className="p-6">
            <DialogHeader>
                <div className="flex flex-col-reverse sm:flex-row justify-between items-start gap-4">
                    <div className="flex items-center gap-2">
                        <DialogTitle className="text-2xl pr-4">{activeWinery.name}</DialogTitle>
                        {activeWinery.trip_name && activeWinery.trip_date && (
                            <Link href={`/trips?date=${activeWinery.trip_date.split("T")[0]}&tripId=${activeWinery.trip_id}`} passHref onClick={closeWineryModal}>
                            <Badge className="bg-[#f17e3a] hover:bg-[#f17e3a] cursor-pointer">
                                <Clock className="w-3 h-3 mr-1" />
                                On Trip: {activeWinery.trip_name}
                            </Badge>
                            </Link>
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
                <VisitHistory visits={visits} editingVisitId={editingVisitId} onEditClick={handleEditClick} onDeleteVisit={handleDeleteVisit} onTogglePhotoForDeletion={togglePhotoForDeletion} />
              ) : (
                <p className="text-sm text-muted-foreground">{activeWinery.userVisited ? "You haven't reviewed any visits here yet." : "You haven't visited this winery yet."}</p>
              )}
            </div>
          </div>
          <VisitForm ref={visitFormRef} winery={activeWinery} editingVisit={editingVisit || null} onCancelEdit={handleCancelEdit} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
