import { Visit } from "@/lib/types";
import { useWineryStore } from "@/lib/stores/wineryStore";
import VisitHistory from "./VisitHistory";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useUIStore } from "@/lib/stores/uiStore"; // Import UI Store
import { useToast } from "@/hooks/use-toast";
import { useMemo } from "react";
import { Calendar, MapPin } from "lucide-react";

// Extended Visit type to include winery name for display context
interface VisitWithContext extends Visit {
  wineryName: string;
  wineryId: string;
}

export default function GlobalVisitHistory() {
  const { persistentWineries } = useWineryStore();
  const { openWineryModal } = useUIStore(); // Use UI Store
  const { deleteVisit: deleteVisitAction } = useVisitStore();
  const { toast } = useToast();


  // Flatten all visits from all wineries into a single array
  const allVisits: VisitWithContext[] = useMemo(() => {
    return persistentWineries.flatMap(winery => 
      (winery.visits || []).map(visit => ({
        ...visit,
        wineryName: winery.name,
        wineryId: winery.id
      }))
    ).sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
  }, [persistentWineries]);

  const handleEditClick = (visit: Visit) => {
    const visitWithContext = visit as VisitWithContext;
    if (visitWithContext.wineryId) {
        openWineryModal(visitWithContext.wineryId);
        toast({ description: "Opening winery details to edit visit..." });
    }
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

  const handleTogglePhotoForDeletion = () => {
     // No-op for now in global view
  };

  if (allVisits.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <p>No visits recorded yet.</p>
        <p className="text-sm">Visit a winery and log your experience!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       {allVisits.map((visit) => (
           <div key={visit.id} className="relative">
               <div className="flex items-center gap-2 mb-2 px-1">
                   <MapPin className="w-4 h-4 text-muted-foreground" />
                   <span className="text-sm font-medium text-muted-foreground">{visit.wineryName}</span>
               </div>
               <VisitHistory 
                   visits={[visit]} 
                   editingVisitId={null} 
                   onEditClick={handleEditClick} 
                   onDeleteVisit={handleDeleteVisit} 
                   onTogglePhotoForDeletion={handleTogglePhotoForDeletion} 
               />
           </div>
       ))}
    </div>
  );
}
