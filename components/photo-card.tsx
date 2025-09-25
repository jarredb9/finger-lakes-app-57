
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from './ui/button';
import { X, Loader2 } from 'lucide-react';

interface PhotoCardProps {
  photoPath: string;
  visitId: string;
  onDelete: (visitId: string, photoPath: string) => void;
}

export default function PhotoCard({ photoPath, visitId, onDelete }: PhotoCardProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const getSignedUrl = async () => {
      setIsLoading(true);
      const { data, error } = await supabase.storage
        .from('visit-photos')
        .createSignedUrl(photoPath, 300); // 5 minutes

      if (error) {
        console.error('Error creating signed URL:', error);
      } else {
        setSignedUrl(data.signedUrl);
      }
      setIsLoading(false);
    };

    getSignedUrl();
  }, [photoPath, supabase.storage]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(visitId, photoPath);
    } catch (error) { 
      // Error is handled by the toast in the store
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative w-24 h-24 rounded-md overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center w-full h-full bg-gray-200">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : signedUrl ? (
        <img src={signedUrl} alt="Visit photo" className="w-full h-full object-cover" />
      ) : (
        <div className="flex items-center justify-center w-full h-full bg-gray-200 text-xs text-center text-red-500 p-1">
          Photo unavailable
        </div>
      )}
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-1 right-1 h-6 w-6 z-10"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </Button>
    </div>
  );
}
