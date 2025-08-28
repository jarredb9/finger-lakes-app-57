// file: components/home-client-page.tsx
"use client"

import { useState } from "react";
import dynamic from 'next/dynamic'
import WineryMap from '@/components/winery-map';
import { Loader2 } from "lucide-react";
import { Trip } from "@/lib/types";

// Dynamic import the WineryMap component, ensuring it is a client-side component
const WineryMapWrapper = dynamic(() => import('@/components/winery-map'), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-100 rounded-lg animate-pulse flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>,
});


export default function HomeClientPage({ userId }: { userId: string }) {
    // This state is now managed here and passed down to the WineryMapWrapper
    const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

    return (
        <WineryMapWrapper
          userId={userId}
          selectedTrip={selectedTrip}
          setSelectedTrip={setSelectedTrip}
        />
    );
}