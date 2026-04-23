"use client";

import React, { useState, useEffect } from "react";
import { usePWAUpdate } from "./use-pwa-update";

export function usePwa() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const { isUpdateAvailable, applyUpdate } = usePWAUpdate();
  const [isStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as any).standalone
      || document.referrer.includes("android-app://");
  });

  useEffect(() => {
    // Handle Install Prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const installApp = React.useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  return {
    isInstallable: !!installPrompt,
    installApp,
    isUpdateAvailable,
    updateApp: applyUpdate,
    isStandalone
  };
}
