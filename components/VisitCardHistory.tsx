// components/VisitHistory.tsx
import { Visit } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Edit, Trash2 } from "lucide-react";
import PhotoCard from "./photo-card";

interface VisitHistoryProps {
  visits: Visit[];
  editingVisitId: string | null;
  onEditClick: (visit: Visit) => void;
  onDeleteVisit: (visitId: string) => void;
  onTogglePhotoForDeletion: (photoPath: string) => void;
}

export default function VisitHistory({ visits, editingVisitId, onEditClick, onDeleteVisit, onTogglePhotoForDeletion }: VisitHistoryProps) {
  const sortedVisits = visits.slice().sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());

  return (
    <div className="space-y-3">
      {sortedVisits.map((visit) => (
        <Card key={visit.id} className="bg-slate-50 border-slate-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-slate-800">{new Date(visit.visit_date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                {visit.rating && (
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-5 h-5 ${i < visit.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEditClick(visit)}>
                  <Edit className="w-4 h-4" />
                </Button>
                {visit.id && (
                  <Button variant="ghost" size="sm" onClick={() => onDeleteVisit(String(visit.id!))} className="text-red-600 hover:text-red-800 hover:bg-red-50" aria-label={`Delete visit`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            {visit.user_review && <p className="text-sm text-slate-700 bg-white p-3 rounded-md border">{visit.user_review}</p>}
            {visit.photos && visit.photos.length > 0 && editingVisitId !== visit.id && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {visit.photos.map((photoPath, index) => (
                  <PhotoCard key={index} photoPath={photoPath} onDelete={() => onTogglePhotoForDeletion(photoPath)} isEditing={false} isMarkedForDeletion={false} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}