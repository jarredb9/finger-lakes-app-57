
// components/PhotoUploader.tsx
import { ChangeEvent, Dispatch, SetStateAction } from "react";
import Image from "next/image";
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
  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      
      // Immediately convert to stable blobs to prevent NotReadableError in WebKit
      // when the input handle is invalidated.
      const stableBlobs = await Promise.all(filesArray.map(async (file) => {
        try {
          // If the "file" is actually a string data URL (injected by test)
          if (typeof file === 'string' && (file as string).startsWith('data:')) {
             const res = await fetch(file);
             const blob = await res.blob();
             return new File([blob], "photo.png", { type: blob.type });
          }

          // Check if file is readable before attempting conversion
          if (file.size === 0) return file; 
          const ab = await file.arrayBuffer();
          return new File([ab], file.name, { type: file.type });
        } catch (err) {
          console.warn('[PhotoUploader] Failed to stabilize file:', file.name, err);
          return file; 
        }
      }));

      setPhotos((prevPhotos) => [...prevPhotos, ...stableBlobs]);
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
            <PhotoCard key={index} photoPath={photoPath} onDelete={() => togglePhotoForDeletion(photoPath)} isEditing={true} isMarkedForDeletion={photosToDelete.includes(photoPath)} />
          ))}
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {photos.map((file, index) => (
            <div key={index} className="relative">
              <Image 
                src={URL.createObjectURL(file)} 
                alt={`Preview ${index + 1}`} 
                width={96}
                height={96}
                className="rounded-md object-cover" 
                unoptimized
                onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)} 
              />
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
          <input 
            id="dropzone-file" 
            type="file" 
            className="hidden" 
            multiple 
            onChange={handlePhotoChange} 
            accept="image/png, image/jpeg, image/gif" 
            data-testid="photo-file-input"
          />
        </label>
      </div>
    </div>
  );
}
