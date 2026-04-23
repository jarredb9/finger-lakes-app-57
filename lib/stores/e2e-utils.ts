/**
 * E2E Utility Helpers for Stores
 * These functions implement the "Nuclear Store Bypass" rule defined in GEMINI.md.
 */

export const isE2E = () => typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true';

export const getE2EHeaders = () => isE2E() ? { 'x-skip-sw-interception': 'true' } : {};

export const shouldSkipRealSync = () => {
    if (!isE2E()) return false;
    
    // Check localStorage first (survives reloads and navigations)
    if (typeof window !== 'undefined' && localStorage.getItem('_E2E_ENABLE_REAL_SYNC') === 'true') {
        return false;
    }
    
    // Fallback to globalThis (for immediate state before storage sync)
    // @ts-ignore
    if (typeof window !== 'undefined' && globalThis._E2E_ENABLE_REAL_SYNC === true) {
        return false;
    }
    
    // If not explicitly enabled, we skip real sync to avoid network issues in emulated environments (WebKit)
    return true;
};

export const isWebKitFallback = () => {
    if (typeof window !== 'undefined' && localStorage.getItem('_E2E_WEBKIT_SYNC_FALLBACK') === 'true') {
        return true;
    }
    // @ts-ignore
    return typeof window !== 'undefined' && globalThis._E2E_WEBKIT_SYNC_FALLBACK === true;
};

export const signalSyncIntercepted = () => {
    if (typeof window !== 'undefined') {
        // @ts-ignore
        globalThis._E2E_SYNC_REQUEST_INTERCEPTED = true;
        localStorage.setItem('_E2E_SYNC_REQUEST_INTERCEPTED', 'true');
    }
};
