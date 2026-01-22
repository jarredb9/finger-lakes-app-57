"use client";

import { useState, useEffect } from "react";
import { usePwa } from "@/hooks/use-pwa";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, X, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function PwaHandler() {
  const { isInstallable, installApp, isUpdateAvailable, updateApp } = usePwa();
  const { toast, dismiss: dismissToast } = useToast();
  const [isDismissed, setIsDismissed] = useState(false);

  // Handle Update Notification (Rare, so we can keep it as a high-priority Toast or use the banner)
  // We'll use a Toast for updates as they are critical, but the user specifically asked about the "install card".
  useEffect(() => {
    if (isUpdateAvailable) {
      const { id } = toast({
        title: "Update Available",
        description: "A new version is ready.",
        duration: Infinity,
        action: (
          <Button 
            size="sm" 
            onClick={() => {
              updateApp();
              dismissToast(id);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Update
          </Button>
        ),
      });
    }
  }, [isUpdateAvailable, toast, updateApp, dismissToast]);

  if (!isInstallable || isDismissed) return null;

  return (
    <>
      {/* Mobile: Full-width top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-[100] bg-background border-b shadow-sm animate-in fade-in slide-in-from-top-full duration-300">
        <div className="flex items-center justify-between px-4 py-2 gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="bg-primary/10 p-1.5 rounded-full shrink-0">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-bold leading-none truncate">Install App</span>
              <span className="text-[11px] text-muted-foreground truncate">Faster access & offline mode</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            <Button 
              size="sm" 
              className="h-8 px-3 text-xs font-bold"
              onClick={installApp}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Install
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground"
              onClick={() => setIsDismissed(true)}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop: Bottom-left card */}
      <div className="hidden md:block fixed bottom-4 left-4 z-[100] animate-in fade-in slide-in-from-left-full duration-300">
        <Card className="w-80 shadow-2xl border-primary/20 overflow-hidden">
          <div className="absolute top-2 right-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full opacity-70 hover:opacity-100"
              onClick={() => setIsDismissed(true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <CardContent className="p-4 pt-5">
            <div className="flex gap-4">
              <div className="bg-primary/10 p-2.5 rounded-xl h-fit">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1 pr-4">
                <h4 className="text-sm font-bold leading-none">Install Winery App</h4>
                <p className="text-xs text-muted-foreground leading-normal">
                  Add to your home screen for the best experience.
                </p>
                <div className="pt-2">
                  <Button size="sm" className="w-full h-8 text-xs" onClick={installApp}>
                    Install Now
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}