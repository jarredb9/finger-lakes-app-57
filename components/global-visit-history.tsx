import { useState, useEffect } from "react";
import { Visit, GooglePlaceId, WineryDbId } from "@/lib/types";
import VisitCardHistory from "./VisitCardHistory";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useToast } from "@/hooks/use-toast";
import { Calendar, MapPin, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Pagination, PaginationContent, PaginationItem, PaginationNext } from "@/components/ui/pagination";

// Extended Visit type for display context in the global history view
export interface VisitWithContext extends Visit {
  wineryName: string;
  wineryId: GooglePlaceId; // This is GooglePlaceId
  friend_visits?: any[]; // From RPC
  // Add temporary 'wineries' field for table compatibility, as required by the original code
  wineries: {
    id: WineryDbId; // This is the DB ID
    google_place_id: GooglePlaceId;
    name: string;
    address: string;
    latitude: string;
    longitude: string;
  };
}

interface GlobalVisitHistoryProps {
  // allVisits prop is removed as this component will fetch its own data
}

const PAGE_SIZE = 10;

export default function GlobalVisitHistory({}: GlobalVisitHistoryProps) {
  const { openWineryModal } = useUIStore();
  const { deleteVisit: deleteVisitAction } = useVisitStore();
  const { toast } = useToast();
  const [visits, setVisits] = useState<VisitWithContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchVisits = async (pageNumber: number) => {
    setIsLoading(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc('get_paginated_visits_with_winery_and_friends', {
        page_number: pageNumber,
        page_size: PAGE_SIZE
      });

      if (error) throw error;

      const fetchedVisits: VisitWithContext[] = (data || []).map((v: any) => ({
        id: v.visit_id, // RPC returns visit_id
        user_id: v.user_id,
        visit_date: v.visit_date,
        user_review: v.user_review,
        rating: v.rating,
        photos: v.photos,
        winery_id: v.winery_id as WineryDbId,
        wineryName: v.winery_name,
        wineryId: v.google_place_id as GooglePlaceId, // Assuming RPC returns this too or derive
        friend_visits: v.friend_visits,
        wineries: { // Structure needed for VisitWithContext
          id: v.winery_id as WineryDbId,
          google_place_id: v.google_place_id as GooglePlaceId,
          name: v.winery_name,
          address: v.winery_address,
          latitude: '0', // Placeholder
          longitude: '0', // Placeholder
        }
      }));

      setVisits(prev => (pageNumber === 1 ? fetchedVisits : [...prev, ...fetchedVisits]));
      setHasMore(fetchedVisits.length === PAGE_SIZE);

    } catch (error) {
      console.error("Failed to fetch visits:", error);
      toast({ variant: "destructive", description: "Failed to load visit history." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVisits(1); // Initial fetch
  }, []);

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
      // Re-fetch current page or simply remove from local state
      setVisits(prev => prev.filter(v => v.id !== visitId));
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
                           onClick={(e) => { e.preventDefault(); setPage(prev => prev + 1); fetchVisits(page + 1); }} 
                           aria-label="Load more visits"
                       />
                   </PaginationItem>
               </PaginationContent>
           </Pagination>
       )}
    </div>
  );
}