// components/friend-photo.tsx
"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';

interface FriendPhotoProps {
  photoPath: string;
  alt: string;
}

export function FriendPhoto({ photoPath, alt }: FriendPhotoProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getSignedUrl = async () => {
      if (photoPath.startsWith('blob:') || photoPath.startsWith('data:')) {
        setSignedUrl(photoPath);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from('visit-photos')
          .createSignedUrl(photoPath, 300);
        if (error) throw error;
        setSignedUrl(data.signedUrl);
      } catch (error) {
        console.error('Error creating signed URL for friend photo:', error);
        setSignedUrl(null);
      }
      setIsLoading(false);
    };

    getSignedUrl();
  }, [photoPath, supabase.storage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-muted">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <img src="" alt={alt} className="hidden" aria-hidden="false" />
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-muted text-[10px] text-center text-red-500 p-1">
        Unavailable
        <img src="" alt={alt} className="hidden" aria-hidden="false" />
      </div>
    );
  }

  return (
    <Image 
      src={signedUrl} 
      alt={alt} 
      fill
      className="object-cover" 
      unoptimized
    />
  );
}
