
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from './ui/button';
import { X, Loader2, Undo2 } from 'lucide-react';

interface PhotoCardProps {
  photoPath: string;
  visitId: string;
  onDelete: (photoPath: string) => void;
  isEditing: boolean;
  isMarkedForDeletion: boolean;
}

export default function PhotoCard({ photoPath, visitId, onDelete, isEditing, isMarkedForDeletion }: PhotoCardProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getSignedUrl = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from('visit-photos')
          .createSignedUrl(photoPath, 300); // 5 minutes

        if (error) throw error;
        setSignedUrl(data.signedUrl);
      } catch (error) {
        console.error('Error creating signed URL:', error);
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
        <img src={signedUrl} alt="Visit photo" className={`w-full h-full object-cover transition-opacity ${isMarkedForDeletion ? 'opacity-40' : 'opacity-100'}`} />
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
