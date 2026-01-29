"use client";

import React, { useState, useEffect } from "react";

export function usePwa() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as any).standalone
      || document.referrer.includes("android-app://");
  });

  useEffect(() => {
    // 1. Handle Install Prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    // 2. Handle Service Worker Updates
    const handleServiceWorkerUpdate = (reg: ServiceWorkerRegistration) => {
      setRegistration(reg);
      setIsUpdateAvailable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
        
        // Check for updates already waiting
        if (reg.waiting) {
          handleServiceWorkerUpdate(reg);
        }

        // Listen for new updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                handleServiceWorkerUpdate(reg);
              }
            });
          }
        });
      });
    }

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

  const updateApp = React.useCallback(() => {
    if (registration?.waiting) {
      // Send message to SW to skipWaiting
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    }
  }, [registration]);

  return {
    isInstallable: !!installPrompt,
    installApp,
    isUpdateAvailable,
    updateApp,
    isStandalone
  };
}
