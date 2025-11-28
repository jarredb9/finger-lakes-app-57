import { useState, useEffect, forwardRef, useCallback } from "react";
import { Visit, Winery } from "@/lib/types";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, Plus, Edit, Loader2 } from "lucide-react";
import PhotoUploader from "./PhotoUploader";

interface VisitFormProps {
  winery: Winery;
  editingVisit: Visit | null;
  onCancelEdit: () => void;
  photosToDelete: string[];
  togglePhotoForDeletion: (photoPath: string) => void;
  setPhotosToDelete: (photos: string[]) => void;
}

const VisitForm = forwardRef<HTMLDivElement, VisitFormProps>(({ winery, editingVisit, onCancelEdit, photosToDelete, togglePhotoForDeletion, setPhotosToDelete }, ref) => {
  const { toast } = useToast();
  const { saveVisit, updateVisit, isSavingVisit } = useVisitStore();
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0]);
  const [userReview, setUserReview] = useState("");
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<File[]>([]);

  const resetForm = useCallback(() => {
    setVisitDate(new Date().toISOString().split("T")[0]);
    setUserReview("");
    setRating(0);
    setPhotos([]);
    setPhotosToDelete([]);
  }, [setPhotosToDelete]);

  useEffect(() => {
    if (editingVisit) {
      setVisitDate(new Date(editingVisit.visit_date + "T00:00:00").toISOString().split("T")[0]);
      setUserReview(editingVisit.user_review || "");
      setRating(editingVisit.rating || 0);
      setPhotos([]);
      setPhotosToDelete([]);
    } else {
      resetForm();
    }
  }, [editingVisit, resetForm, setPhotosToDelete]);

  const handleSave = async () => {
    if (!visitDate.trim()) {
      toast({ title: "Error", description: "Visit date is required.", variant: "destructive" });
      return;
    }

    try {
      if (editingVisit) {
        await updateVisit(editingVisit.id!, { visit_date: visitDate, user_review: userReview, rating }, photos, photosToDelete);
        toast({ description: "Visit updated successfully." });
        onCancelEdit();
      } else {
        await saveVisit(winery, { visit_date: visitDate, user_review: userReview, rating, photos });
        toast({ description: "Visit added successfully." });
        resetForm();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred.";
      toast({ variant: "destructive", description: message });
    }
  };

  return (
    <div ref={ref} className="bg-gray-50 p-6 border-t scroll-mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
          {editingVisit ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          <span>{editingVisit ? "Edit Visit" : "Add New Visit"}</span>
        </h3>
        {editingVisit && (
          <Button variant="outline" size="sm" onClick={onCancelEdit}>
            Cancel Edit
          </Button>
        )}
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="visitDate">Visit Date *</Label>
          <Input id="visitDate" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} max={new Date().toISOString().split("T")[0]} required aria-label="Visit Date" />
        </div>
        <div className="space-y-2">
          <Label>Your Rating</Label>
          <div className="flex items-center space-x-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className={`w-6 h-6 cursor-pointer transition-colors ${i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300 hover:text-yellow-300"}`} onClick={() => setRating(i + 1)} aria-label={`Set rating to ${i + 1}`} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="userReview">Your Review (Optional)</Label>
          <Textarea id="userReview" placeholder="e.g., 'Loved the dry Riesling! Beautiful view from the patio.'" value={userReview} onChange={(e) => setUserReview(e.target.value)} rows={4} aria-label="Your Review" />
        </div>
        <PhotoUploader 
            editingVisit={editingVisit}
            photos={photos}
            setPhotos={setPhotos}
            photosToDelete={photosToDelete}
            togglePhotoForDeletion={togglePhotoForDeletion}
        />
      </div>
      <div className="pt-4 mt-4">
        <Button onClick={handleSave} disabled={!visitDate.trim() || isSavingVisit} className="w-full">
          {isSavingVisit ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : editingVisit ? "Save Changes" : "Add Visit"}
        </Button>
      </div>
    </div>
  );
});

VisitForm.displayName = "VisitForm";

export default VisitForm;