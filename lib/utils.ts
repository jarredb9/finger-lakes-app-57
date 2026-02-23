import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { createClient } from "@/utils/supabase/client"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resilient wrapper for Supabase Edge Function calls.
 * Handles offline detection and specific error types to prevent crashes in WebKit.
 */
export async function invokeFunction<T = any>(
  functionName: string,
  options?: {
    body?: any;
    headers?: Record<string, string>;
    method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  }
): Promise<{ data: T | null; error: any }> {
  // 1. Immediate offline check
  if (typeof window !== "undefined" && !navigator.onLine) {
    return { data: null, error: { message: "offline", isOffline: true } };
  }

  const supabase = createClient();

  try {
    const response = await supabase.functions.invoke(functionName, options);
    
    // In WebKit, sometimes the SDK returns an error object that is not a standard Error
    // if the fetch fails due to network issues while the browser thinks it's online.
    if (response.error) {
      // Check for common network/offline errors that might not be caught by navigator.onLine
      const errorMsg = response.error.message?.toLowerCase() || "";
      if (
        errorMsg.includes("fetch") || 
        errorMsg.includes("network") || 
        errorMsg.includes("failed to fetch")
      ) {
        return { data: null, error: { ...response.error, isOffline: true } };
      }
    }

    return response;
  } catch (err: any) {
    // Catch fatal fetch errors (like FunctionsFetchError)
    console.warn(`[EdgeFunction] ${functionName} failed:`, err);

    const isOffline = 
      !navigator.onLine || 
      err.message?.toLowerCase().includes("fetch") || 
      err.message?.toLowerCase().includes("network");

    return { 
      data: null, 
      error: { 
        message: err.message || "Unknown error", 
        originalError: err,
        isOffline 
      } 
    };
  }
}
