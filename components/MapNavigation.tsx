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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface MapNavigationProps {
  address: string;
  wineryName?: string;
  className?: string;
  latitude?: number | null;
  longitude?: number | null;
  children?: React.ReactNode;
}

export function MapNavigation({
  address,
  wineryName,
  className,
  latitude,
  longitude,
  children,
}: MapNavigationProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const userAgent = typeof window !== "undefined" ? navigator.userAgent || navigator.vendor || (window as any).opera : "";
    const mobile = /android|iphone|ipad|ipod/i.test(userAgent);
    const ios = /iphone|ipad|ipod/i.test(userAgent);
    
    const timer = setTimeout(() => {
      setIsMobile(mobile);
      setIsIOS(ios);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const hasCoords = latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null;
  const encodedAddress = encodeURIComponent(address);

  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

  const appleMapsUrl = hasCoords
    ? `maps://?q=${latitude},${longitude}`
    : `maps://?q=${encodedAddress}`;

  const wazeUrl = hasCoords
    ? `waze://?ll=${latitude},${longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

  // Desktop web fallbacks
  const wazeWebUrl = hasCoords
    ? `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

  const handleOpenMap = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const defaultTrigger = (
    <span className={cn("flex items-start space-x-2 text-left group cursor-pointer", className)}>
      <MapPin className="w-4 h-4 mt-1 shrink-0 group-hover:text-primary transition-colors text-muted-foreground" />
      <span className="group-hover:text-foreground transition-colors group-hover:underline decoration-dotted underline-offset-4">
        {address}
      </span>
      {!isMobile && (
        <ExternalLink className="w-3 h-3 mt-1.5 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
      )}
    </span>
  );

  const renderTriggerElement = () => {
    if (children) {
      return children;
    }
    return (
      <button
        className="block w-fit max-w-full text-left"
        type="button"
        aria-label={`Open navigation options for ${address}`}
      >
        {defaultTrigger}
      </button>
    );
  };

  if (!isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {renderTriggerElement()}
        </PopoverTrigger>
        <PopoverContent
          data-testid="map-navigation-popover"
          className="w-64 p-3 space-y-2 bg-background border border-border rounded-md shadow-md"
          align="start"
        >
          <div className="text-xs font-semibold text-muted-foreground px-2 py-1">Route Winery</div>
          <Button
            variant="ghost"
            className="w-full justify-start h-10 text-sm font-normal"
            onClick={() => handleOpenMap(googleMapsUrl)}
          >
            <Navigation className="mr-2 h-4 w-4 text-blue-500" />
            <span>Google Maps</span>
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start h-10 text-sm font-normal"
            onClick={() => handleOpenMap(appleMapsUrl)}
          >
            <MapIcon className="mr-2 h-4 w-4 text-gray-500" />
            <span>Apple Maps</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start h-10 text-sm font-normal"
            onClick={() => handleOpenMap(wazeWebUrl)}
          >
            <Navigation className="mr-2 h-4 w-4 text-orange-500" />
            <span>Waze</span>
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {renderTriggerElement()}
      </DrawerTrigger>
      <DrawerContent data-testid="map-navigation-popover">
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
                onClick={() => handleOpenMap(googleMapsUrl)}
              >
                <MapIcon className="mr-3 h-5 w-5 text-green-600" />
                <div className="flex flex-col items-start">
                  <span>Maps App</span>
                  <span className="text-xs text-muted-foreground">Open in your default maps app</span>
                </div>
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full justify-start h-14 text-base font-normal border-muted-foreground/20"
              onClick={() => handleOpenMap(wazeUrl)}
            >
              <Navigation className="mr-3 h-5 w-5 text-orange-500" />
              <div className="flex flex-col items-start">
                <span>Waze</span>
                <span className="text-xs text-muted-foreground">Open in Waze navigation app</span>
              </div>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
