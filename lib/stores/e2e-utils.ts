/**
 * E2E Utility Helpers for Stores
 * These functions implement the "Nuclear Store Bypass" rule defined in GEMINI.md.
 */

export const isE2E = () => typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true';

export const getE2EHeaders = () => isE2E() ? { 'x-skip-sw-interception': 'true' } : {};

export const shouldSkipRealSync = () => {
    if (!isE2E()) return false;
    
    const localVal = typeof window !== 'undefined' && localStorage.getItem('_E2E_ENABLE_REAL_SYNC');
    // @ts-ignore
    const globalVal = typeof window !== 'undefined' && globalThis._E2E_ENABLE_REAL_SYNC;

    if (localVal === 'true' || globalVal === true) {
        return false;
    }
    
    return true;
};
