// file: components/home-client-page.tsx
"use client"

import { useState } from "react";
import dynamic from 'next/dynamic'
import { Loader2 } from "lucide-react";
import { Trip } from "@/lib/types";

// Dynamically import components that are client-side only
const WineryMapWrapper = dynamic(() => import('@/components/winery-map'), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-100 rounded-lg animate-pulse flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>,
});

const WineryModal = dynamic(() => import('@/components/winery-modal'), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><Loader2 className="h-8 w-8 text-white animate-spin" /></div>,
});

export default function HomeClientPage({ userId }: { userId: string }) {
    const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

    return (
      <>
        <WineryMapWrapper
          userId={userId}
          selectedTrip={selectedTrip}
          setSelectedTrip={setSelectedTrip}
        />
        <WineryModal selectedTrip={selectedTrip} />
      </>
    );
}