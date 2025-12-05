"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Google Maps API key is not configured.</AlertDescription>
      </Alert>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places", "geocoding", "marker"]}>
      {children}
    </APIProvider>
  );
}
