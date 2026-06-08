"use client";

import React, { useState, useEffect } from "react";
import { MapPin, ExternalLink, Map as MapIcon, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

interface MapNavigationProps {
  address: string;
  wineryName?: string;
  className?: string;
}

/**
 * A reusable component that provides navigation links for an address.
 * Desktop: Opens Google Maps in a new tab.
 * Mobile: Opens a Drawer (Action Sheet) with options for Google and Apple Maps.
 */
export function MapNavigation({ address, wineryName, className }: MapNavigationProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Simple mobile detection
    const userAgent = typeof window !== "undefined" ? navigator.userAgent || navigator.vendor || (window as any).opera : "";
    const mobile = /android|iphone|ipad|ipod/i.test(userAgent);
    const ios = /iphone|ipad|ipod/i.test(userAgent);
    
    // Use a timeout to avoid synchronous setState within an effect (cascading renders)
    const timer = setTimeout(() => {
      setIsMobile(mobile);
      setIsIOS(ios);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const encodedAddress = encodeURIComponent(address);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  const appleMapsUrl = `maps://?q=${encodedAddress}`;
  const genericMapsUrl = `geo:0,0?q=${encodedAddress}`;

  const handleOpenDesktop = (e: React.MouseEvent) => {
    e.preventDefault();
    window.open(googleMapsUrl, "_blank", "noopener,noreferrer");
  };

  const handleOpenMap = (url: string) => {
    window.location.href = url;
    setOpen(false);
  };

  const TriggerContent = (
    <div className={cn("flex items-start space-x-2 text-left group cursor-pointer", className)}>
      <MapPin className="w-4 h-4 mt-1 shrink-0 group-hover:text-primary transition-colors text-muted-foreground" />
      <span className="group-hover:text-foreground transition-colors group-hover:underline decoration-dotted underline-offset-4">
        {address}
      </span>
      {!isMobile && (
        <ExternalLink className="w-3 h-3 mt-1.5 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
      )}
    </div>
  );

  if (!isMobile) {
    return (
      <button 
        onClick={handleOpenDesktop}
        className="block w-fit max-w-full"
        type="button"
        aria-label={`Open ${address} in Google Maps`}
      >
        {TriggerContent}
      </button>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button 
          className="block w-fit max-w-full" 
          type="button"
          aria-label={`Show navigation options for ${address}`}
        >
          {TriggerContent}
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader className="text-left">
            <DrawerTitle className="truncate">{wineryName || "Winery Location"}</DrawerTitle>
            <DrawerDescription className="line-clamp-2">{address}</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 space-y-3 pb-8">
            <Button 
              variant="outline" 
              className="w-full justify-start h-14 text-base font-normal border-muted-foreground/20" 
              onClick={() => handleOpenMap(googleMapsUrl)}
            >
              <Navigation className="mr-3 h-5 w-5 text-blue-500" />
              <div className="flex flex-col items-start">
                <span>Google Maps</span>
                <span className="text-xs text-muted-foreground">Open in Google Maps app or web</span>
              </div>
            </Button>
            
            {isIOS ? (
              <Button 
                variant="outline" 
                className="w-full justify-start h-14 text-base font-normal border-muted-foreground/20" 
                onClick={() => handleOpenMap(appleMapsUrl)}
              >
                <MapIcon className="mr-3 h-5 w-5 text-gray-700" />
                <div className="flex flex-col items-start">
                  <span>Apple Maps</span>
                  <span className="text-xs text-muted-foreground">Open in native Apple Maps app</span>
                </div>
              </Button>
            ) : (
              <Button 
                variant="outline" 
                className="w-full justify-start h-14 text-base font-normal border-muted-foreground/20" 
                onClick={() => handleOpenMap(genericMapsUrl)}
              >
                <MapIcon className="mr-3 h-5 w-5 text-green-600" />
                <div className="flex flex-col items-start">
                  <span>Maps App</span>
                  <span className="text-xs text-muted-foreground">Open in your default maps app</span>
                </div>
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
