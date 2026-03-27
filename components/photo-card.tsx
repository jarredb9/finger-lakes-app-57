import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { Button } from './ui/button';
import { X, Loader2, Undo2 } from 'lucide-react';

interface PhotoCardProps {
  photoPath: string;
  onDelete: (photoPath: string) => void;
  isEditing: boolean;
  isMarkedForDeletion: boolean;
}

export default function PhotoCard({ photoPath, onDelete, isEditing, isMarkedForDeletion }: PhotoCardProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getSignedUrl = async () => {
      // If it's a local blob or data URL (from optimistic update), use it directly
      if (photoPath.startsWith('blob:') || photoPath.startsWith('data:')) {
        setSignedUrl(photoPath);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from('visit-photos')
          .createSignedUrl(photoPath, 300); // 5 minutes

        if (error) throw error;
        setSignedUrl(data.signedUrl);
      } catch (error: any) {
        // If it's a 404/Object not found, use warn to avoid crashing E2E tests 
        // during expected deletion race conditions.
        if (error?.status === 400 || error?.message?.includes('Object not found')) {
            console.warn('Photo not found (expected during deletion):', photoPath);
        } else {
            console.error('Error creating signed URL:', error);
        }
        setSignedUrl(null); // Ensure it shows unavailable on error
      }
      setIsLoading(false);
    };

    getSignedUrl();
  }, [photoPath, supabase.storage]);

  const handleToggleDelete = () => {
    onDelete(photoPath);
  };

  return (
    <div className="relative w-24 h-24 rounded-md overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center w-full h-full bg-gray-200">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : signedUrl ? (
        <Image 
          src={signedUrl} 
          alt="Visit photo" 
          fill
          className={cn("object-cover transition-opacity", isMarkedForDeletion ? "opacity-40" : "opacity-100")} 
          unoptimized
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full bg-gray-200 text-xs text-center text-red-500 p-1">
          Photo unavailable
        </div>
      )}
      {isEditing && (
        <Button
          variant={isMarkedForDeletion ? 'secondary' : 'destructive'}
          size="icon"
          className="absolute top-1 right-1 h-6 w-6 z-10"
          onClick={handleToggleDelete}
        >
          {isMarkedForDeletion ? <Undo2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}