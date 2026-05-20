// components/VisitCardHistory.tsx
import { Visit } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Edit, Trash2, MapPin, Lock, Clock } from "lucide-react";
import PhotoCard from "./photo-card";
import { cn } from "@/lib/utils";

interface VisitHistoryProps {
  visits: Visit[];
  editingVisitId?: string | null;
  onEditClick?: (visit: Visit) => void;
  onDeleteVisit?: (visitId: string) => void;
  onTogglePhotoForDeletion?: (photoPath: string) => void;
  isFriendVisit?: boolean;
  showWineryName?: boolean;
}

export default function VisitHistory({ 
  visits, 
  editingVisitId, 
  onEditClick, 
  onDeleteVisit, 
  onTogglePhotoForDeletion,
  isFriendVisit = false,
  showWineryName = false
}: VisitHistoryProps) {
  const sortedVisits = visits.slice().sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());

  return (
    <div className="space-y-3">
      {sortedVisits.map((visit) => {
        const isPending = visit.syncStatus === 'pending';
        
        return (
          <Card 
            key={visit.id} 
            className={cn(
              "bg-slate-50 border-slate-200 transition-opacity",
              isPending && "opacity-50"
            )} 
            data-testid="visit-card"
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    {showWineryName && visit.wineries && (
                      <div className="flex items-center gap-1.5 text-primary mb-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <p className="text-sm font-bold tracking-tight uppercase">{visit.wineries.name}</p>
                      </div>
                    )}
                    {isPending && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200 animate-pulse ml-auto flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Pending
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800">
                      {new Date(visit.visit_date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                    {(visit as any).is_private && (
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    )}
                  </div>
                  {visit.rating && (
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-5 h-5 ${i < visit.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                      ))}
                    </div>
                  )}
                </div>
                {!isFriendVisit && (
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onEditClick?.(visit)} 
                      aria-label="Edit visit"
                      disabled={isPending}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    {visit.id && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => onDeleteVisit?.(String(visit.id!))} 
                        className="text-red-600 hover:text-red-800 hover:bg-red-50" 
                        aria-label={`Delete visit`}
                        disabled={isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {visit.user_review && <p className="text-sm text-slate-700 bg-white p-3 rounded-md border">{visit.user_review}</p>}
              {visit.photos && visit.photos.length > 0 && editingVisitId !== String(visit.id) && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {visit.photos.map((photoPath, index) => (
                    <PhotoCard 
                      key={index} 
                      photoPath={photoPath} 
                      onDelete={() => onTogglePhotoForDeletion?.(photoPath)} 
                      isEditing={false} 
                      isMarkedForDeletion={false} 
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}