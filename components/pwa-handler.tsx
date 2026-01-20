"use client";

import { useEffect, useRef } from "react";
import { usePwa } from "@/hooks/use-pwa";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";

export function PwaHandler() {
  const { isInstallable, installApp, isUpdateAvailable, updateApp } = usePwa();
  const { toast, dismiss } = useToast();
  const updateToastShown = useRef(false);
  const installToastShown = useRef(false);

  // Handle Update Notification
  useEffect(() => {
    if (isUpdateAvailable && !updateToastShown.current) {
      updateToastShown.current = true;
      const { id } = toast({
        title: "Update Available",
        description: "A new version of the app is ready. Reload to update.",
        duration: Infinity,
        action: (
          <Button 
            size="sm" 
            onClick={() => {
              updateApp();
              dismiss(id);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Update
          </Button>
        ),
      });
    }
  }, [isUpdateAvailable, toast, updateApp, dismiss]);

  // Handle Install Notification
  useEffect(() => {
    if (isInstallable && !installToastShown.current) {
      installToastShown.current = true;
      const { id } = toast({
        title: "Install App",
        description: "Install our app for a better experience and offline access.",
        action: (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => {
              installApp();
              dismiss(id);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Install
          </Button>
        ),
      });
    }
  }, [isInstallable, installApp, toast, dismiss]);

  return null;
}
