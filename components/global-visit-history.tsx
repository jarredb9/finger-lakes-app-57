import { useEffect } from "react";
import { Visit, VisitWithWinery } from "@/lib/types";
import VisitCardHistory from "./VisitCardHistory";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useToast } from "@/hooks/use-toast";
import { Calendar, MapPin, Loader2 } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationNext } from "@/components/ui/pagination";

interface GlobalVisitHistoryProps {
  // allVisits prop is removed as this component will fetch its own data
}

export default function GlobalVisitHistory({}: GlobalVisitHistoryProps) {
  const { openWineryModal } = useUIStore();
  const { 
      visits, 
      isLoading, 
      page, 
      hasMore, 
      fetchVisits, 
      deleteVisit: deleteVisitAction 
  } = useVisitStore();
  const { toast } = useToast();

  useEffect(() => {
    fetchVisits(1, true); // Initial fetch
  }, [fetchVisits]);

  const handleEditClick = (visit: Visit) => {
    const visitWithContext = visit as VisitWithWinery;
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

  if (visits.length === 0 && isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (visits.length === 0 && !isLoading) {
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
       {visits.map((visit) => (
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
       {hasMore && (
           <Pagination>
               <PaginationContent>
                   <PaginationItem>
                       <PaginationNext 
                           href="#" 
                           onClick={(e) => { e.preventDefault(); fetchVisits(page + 1); }} 
                           aria-label="Load more visits"
                       />
                   </PaginationItem>
               </PaginationContent>
           </Pagination>
       )}
    </div>
  );
}