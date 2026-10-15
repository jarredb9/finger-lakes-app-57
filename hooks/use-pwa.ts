'use client';

import React, { useState, useEffect } from 'react';
import { usePWAUpdate } from './use-pwa-update';

export interface UsePwaReturn {
  isInstallable: boolean;
  installApp: () => Promise<void>;
  isUpdateAvailable: boolean;
  updateApp: () => void;
  isStandalone: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePwa(): UsePwaReturn {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const { isUpdateAvailable, applyUpdate } = usePWAUpdate();
  const [isStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone
      || (document.referrer && document.referrer.includes('android-app://'))
    );
  });

  useEffect(() => {
    // Handle Install Prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const installApp = React.useCallback(async () => {
    if (!installPrompt || isStandalone) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  }, [installPrompt, isStandalone]);

  return {
    isInstallable: !isStandalone && !!installPrompt,
    installApp,
    isUpdateAvailable,
    updateApp: applyUpdate,
    isStandalone
  };
}
