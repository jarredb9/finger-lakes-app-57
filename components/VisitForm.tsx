import { useState, useEffect, forwardRef, useCallback, useRef } from "react";
import { Visit } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, Plus, Edit, Loader2, Lock } from "lucide-react";
import PhotoUploader from "./PhotoUploader";
import { Checkbox } from "@/components/ui/checkbox";

interface VisitFormProps {
  editingVisit: Visit | null;
  onCancel: () => void;
  onSave: (visitData: { 
    visit_date: string; 
    user_review: string; 
    rating: number; 
    photos: File[]; 
    is_private?: boolean 
  }, photosToDelete: string[]) => Promise<void>;
  isSubmitting: boolean;
  photosToDelete: string[];
  togglePhotoForDeletion: (photoPath: string) => void;
  setPhotosToDelete: (photos: string[]) => void;
}

const VisitForm = forwardRef<HTMLDivElement, VisitFormProps>(({ 
  editingVisit, 
  onCancel, 
  onSave,
  isSubmitting: isExternalSubmitting,
  photosToDelete, 
  togglePhotoForDeletion, 
  setPhotosToDelete 
}, ref) => {
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0]);
  const [userReview, setUserReview] = useState("");
  const [rating, setRating] = useState(5);
  const [isPrivate, setIsPrivate] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [isInternalSubmitting, setIsInternalSubmitting] = useState(false);
  const submissionGuard = useRef(false);

  const isSubmitting = isExternalSubmitting || isInternalSubmitting;

  const resetForm = useCallback(() => {
    setVisitDate(new Date().toISOString().split("T")[0]);
    setUserReview("");
    setRating(5);
    setIsPrivate(false);
    setPhotos([]);
    setPhotosToDelete([]);
    submissionGuard.current = false;
  }, [setPhotosToDelete]);

  useEffect(() => {
    if (editingVisit) {
      setVisitDate(new Date(editingVisit.visit_date + "T00:00:00").toISOString().split("T")[0]);
      setUserReview(editingVisit.user_review || "");
      setRating(editingVisit.rating || 5);
      setIsPrivate((editingVisit as any).is_private || false);
      setPhotos([]);
      setPhotosToDelete([]);
      submissionGuard.current = false;
    } else {
      resetForm();
    }
  }, [editingVisit, resetForm, setPhotosToDelete]);

  const handleSave = async () => {
    if (submissionGuard.current || isSubmitting) {
        return;
    }
    
    submissionGuard.current = true;
    setIsInternalSubmitting(true);
    try {
      await onSave({ 
        visit_date: visitDate, 
        user_review: userReview, 
        rating, 
        photos, 
        is_private: isPrivate 
      }, photosToDelete);
    } catch (err) {
      // Error handling is handled by the parent's onSave or by UI notifications
    } finally {
      setIsInternalSubmitting(false);
      submissionGuard.current = false;
    }
  };

  return (
    <div ref={ref} className="bg-gray-50 p-6 border-t scroll-mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
          {editingVisit ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          <span>{editingVisit ? "Edit Visit" : "Add New Visit"}</span>
        </h3>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="visitDate">Visit Date *</Label>
          <Input id="visitDate" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} max={new Date().toISOString().split("T")[0]} required aria-label="Visit Date" disabled={isSubmitting} />
        </div>
        <div className="space-y-2">
          <Label>Your Rating</Label>
          <div className="flex items-center space-x-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className={`w-6 h-6 ${isSubmitting ? "cursor-not-allowed opacity-50" : "cursor-pointer"} transition-colors ${i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300 hover:text-yellow-300"}`} onClick={() => !isSubmitting && setRating(i + 1)} aria-label={`Set rating to ${i + 1}`} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="userReview">Your Review (Optional)</Label>
          <Textarea id="userReview" placeholder="e.g., 'Loved the dry Riesling! Beautiful view from the patio.'" value={userReview} onChange={(e) => setUserReview(e.target.value)} rows={4} aria-label="Your Review" disabled={isSubmitting} />
        </div>
        <div className="flex items-center space-x-2 py-1">
          <Checkbox 
            id="isPrivate" 
            checked={isPrivate} 
            onCheckedChange={(checked) => setIsPrivate(checked === true)} 
            disabled={isSubmitting}
          />
          <Label htmlFor="isPrivate" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            Make this visit private
          </Label>
          <p className="text-xs text-muted-foreground ml-auto italic">
            Private visits aren&apos;t shown to friends
          </p>
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
        <Button 
            data-testid="visit-save-button"
            onClick={handleSave} 
            disabled={!visitDate.trim() || isSubmitting} 
            className="w-full"
        >
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : editingVisit ? "Save Changes" : "Add Visit"}
        </Button>
      </div>
    </div>
  );
});

VisitForm.displayName = "VisitForm";

export default VisitForm;