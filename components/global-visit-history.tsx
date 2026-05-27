import { useEffect } from "react";
import { Visit, VisitWithWinery } from "@/lib/types";
import VisitCardHistory from "./VisitCardHistory";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useToast } from "@/hooks/use-toast";
import { Calendar, MapPin } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationNext } from "@/components/ui/pagination";

interface GlobalVisitHistoryProps {
  isActive?: boolean;
}

export default function GlobalVisitHistory({ isActive = true }: GlobalVisitHistoryProps) {
  const { openWineryModal } = useUIStore();
  const { ensureWineryDetails } = useWineryStore();
  const { 
      visits, 
      isLoading, 
      page, 
      hasMore, 
      lastActionTimestamp,
      fetchVisits, 
      deleteVisit: deleteVisitAction 
  } = useVisitStore();
  const { toast } = useToast();

  useEffect(() => {
    if (isActive) {
        fetchVisits(1, true); // Re-fetch on activation or mutation
    }
  }, [fetchVisits, lastActionTimestamp, isActive]);

  const isEmpty = visits.length === 0;

  return (
    <div className="space-y-6" data-testid="visit-history-container" data-state={isLoading && isEmpty ? 'loading' : 'ready'}>
       {isLoading && isEmpty ? (
         <div className="flex flex-col gap-6 py-4">
           {[1, 2, 3].map(i => (
             <div key={i} className="space-y-3">
               <div className="flex items-center gap-2 px-1">
                 <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                 <div className="h-4 w-32 bg-muted animate-pulse rounded" />
               </div>
               <div className="h-32 w-full bg-muted animate-pulse rounded-xl" />
             </div>
           ))}
         </div>
       ) : isEmpty ? (
         <div className="text-center py-10 text-muted-foreground">
           <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
           <p>No visits recorded yet.</p>
           <p className="text-sm">Visit a winery and log your experience!</p>
         </div>
       ) : (
         <>
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
         </>
       )}
    </div>
  );

  function handleEditClick(visit: Visit) {
    const visitWithContext = visit as VisitWithWinery;
    if (visitWithContext.wineryId) {
        ensureWineryDetails(visitWithContext.wineryId);
        openWineryModal(visitWithContext.wineryId);
        toast({ description: "Opening winery details to edit visit..." });
    }
  }

  async function handleDeleteVisit(visitId: string) {
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
  }

  function handleTogglePhotoForDeletion() {
     // No-op for now in global view
  }
}
