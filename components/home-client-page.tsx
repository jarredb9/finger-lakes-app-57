// file: components/home-client-page.tsx
"use client"

import dynamic from 'next/dynamic'
import { Loader2 } from "lucide-react";

// Dynamic import the WineryMap component, ensuring it is a client-side component
const WineryMapWrapper = dynamic(() => import('@/components/winery-map'), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-100 rounded-lg animate-pulse flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/></div>,
});

export default function HomeClientPage({ userId }: { userId: string }) {
    return (
        <WineryMapWrapper userId={userId} />
    );
}