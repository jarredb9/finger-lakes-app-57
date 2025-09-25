
// components/PhotoUploader.tsx
import { ChangeEvent, Dispatch, SetStateAction } from "react";
import { Visit } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import PhotoCard from "./photo-card";

interface PhotoUploaderProps {
  editingVisit: Visit | null;
  photos: File[];
  setPhotos: Dispatch<SetStateAction<File[]>>;
  photosToDelete: string[];
  togglePhotoForDeletion: (photoPath: string) => void;
}

export default function PhotoUploader({ editingVisit, photos, setPhotos, photosToDelete, togglePhotoForDeletion }: PhotoUploaderProps) {
  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setPhotos((prevPhotos) => [...prevPhotos, ...filesArray]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prevPhotos) => prevPhotos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <Label>Photos</Label>
      {editingVisit?.photos && editingVisit.photos.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {editingVisit.photos.map((photoPath, index) => (
            <PhotoCard key={index} photoPath={photoPath} visitId={editingVisit.id!} onDelete={() => togglePhotoForDeletion(photoPath)} isEditing={true} isMarkedForDeletion={photosToDelete.includes(photoPath)} />
          ))}
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {photos.map((file, index) => (
            <div key={index} className="relative">
              <img src={URL.createObjectURL(file)} alt={`Preview ${index + 1}`} className="w-24 h-24 rounded-md object-cover" onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)} />
              <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => handleRemovePhoto(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-center w-full">
        <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-gray-100">
          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
            <Upload className="w-8 h-8 mb-2 text-gray-500" />
            <p className="mb-2 text-sm text-gray-500">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500">PNG, JPG, GIF (MAX. 5MB)</p>
          </div>
          <input id="dropzone-file" type="file" className="hidden" multiple onChange={handlePhotoChange} accept="image/png, image/jpeg, image/gif" />
        </label>
      </div>
    </div>
  );
}
