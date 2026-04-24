'use client';

import { useEffect, useCallback, useState } from 'react';

export function usePWAUpdate() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Listen for new updates
    navigator.serviceWorker.ready.then((reg) => {
      setRegistration(reg);
      
      if (reg.waiting) {
        setIsUpdateAvailable(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setIsUpdateAvailable(true);
            }
          });
        }
      });
    });

    // Handle controller change (new SW taking over)
    const handleControllerChange = () => {
      // Prevent infinite reload loops
      if ((globalThis as any)._PWA_UPDATING) {
          return;
      }
      (globalThis as any)._PWA_UPDATING = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [registration]);

  return { isUpdateAvailable, applyUpdate };
}
