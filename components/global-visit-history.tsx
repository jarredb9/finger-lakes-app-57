import { Visit } from "@/lib/types";
import VisitCardHistory from "./VisitCardHistory";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useToast } from "@/hooks/use-toast";
import { Calendar, MapPin } from "lucide-react";

// Extended Visit type to include winery name for display context
export interface VisitWithContext extends Visit {
  wineryName: string;
  wineryId: string;
  // Add temporary 'wineries' field for table compatibility, as required by the original code
  wineries: {
    id: number;
    google_place_id: string;
    name: string;
    address: string;
    latitude: string;
    longitude: string;
  };
}

interface GlobalVisitHistoryProps {
  // allVisits is exposed via prop to parent for modal
  allVisits: VisitWithContext[];
}

export default function GlobalVisitHistory({ allVisits }: GlobalVisitHistoryProps) {
  const { openWineryModal } = useUIStore();
  const { deleteVisit: deleteVisitAction } = useVisitStore();
  const { toast } = useToast();

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
               <VisitCardHistory 
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
