"use server"

import { createClient } from "@/utils/supabase/server";
import { getUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// Type for winery data received from client
interface WineryData {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    phone?: string | null;
    website?: string | null;
    rating?: number | null;
}

/**
 * Toggles a winery as a favorite for the current user.
 * If the winery is already a favorite, it will be removed.
 * If not, it will be added.
 * Handles creating the winery in the database if it doesn't exist via RPC.
 *
 * @param wineryData - The data of the winery to toggle.
 * @param skipRevalidation - If true, skips Next.js cache revalidation (useful for optimistic updates).
 * @returns An object indicating success or failure.
 */
export async function toggleFavorite(wineryData: WineryData, skipRevalidation = false) {
    const user = await getUser();
    if (!user) {
        return { success: false, error: "Unauthorized" };
    }

    const supabase = await createClient();

    try {
        // Step 1: Ensure the winery exists using the security-definer RPC
        // This bypasses RLS 'UPDATE' restrictions that block direct upserts
        const { data: wineryId, error: rpcError } = await supabase
            .rpc('ensure_winery', { p_winery_data: wineryData });

        if (rpcError) {
            console.error("Error ensuring winery via RPC:", rpcError);
            return { success: false, error: "Failed to ensure winery existence." };
        }
        
        // ensure_winery returns the ID directly
        const wineryIdInt = wineryId as number;

        // Step 2: Check if already a favorite and toggle
        const { data: existingFavorite, error: checkFavoriteError } = await supabase
            .from("favorites")
            .select("id")
            .eq("user_id", user.id)
            .eq("winery_id", wineryIdInt)
            .maybeSingle();

        if (checkFavoriteError) {
            console.error("Error checking existing favorite:", checkFavoriteError);
            return { success: false, error: "Failed to check favorite status." };
        }

        if (existingFavorite) {
            // Already a favorite, so remove it
            const { error: deleteError } = await supabase
                .from("favorites")
                .delete()
                .eq("user_id", user.id)
                .eq("winery_id", wineryIdInt);

            if (deleteError) {
                console.error("Error removing favorite:", deleteError);
                return { success: false, error: "Failed to remove favorite." };
            }
            
            if (!skipRevalidation) {
                revalidatePath('/trips');
                revalidatePath('/');
            }
            return { success: true, message: "Removed from favorites." };
        } else {
            // Not a favorite, so add it
            const { error: insertFavoriteError } = await supabase
                .from("favorites")
                .insert({ user_id: user.id, winery_id: wineryIdInt });

            if (insertFavoriteError) {
                console.error("Error adding favorite:", insertFavoriteError);
                return { success: false, error: "Failed to add favorite." };
            }
            
            if (!skipRevalidation) {
                revalidatePath('/trips');
                revalidatePath('/');
            }
            return { success: true, message: "Added to favorites." };
        }
    } catch (error) {
        console.error("Toggle Favorite Server Action Error:", error);
        return { success: false, error: "An unexpected error occurred." };
    }
}

/**
 * Fetches all favorite wineries for the current user.
 * @returns A list of favorite wineries or an error.
 */
export async function getFavorites() {
    const user = await getUser();
    if (!user) {
        return { success: false, error: "Unauthorized", data: [] };
    }

    const supabase = await createClient();
    try {
        const { data, error } = await supabase
            .from("favorites")
            .select("wineries(*)")
            .eq("user_id", user.id);

        if (error) {
            console.error("Error fetching favorites:", error);
            return { success: false, error: error.message, data: [] };
        }

        // Return the full winery objects
        const favoriteWineries = data.map(item => item.wineries).filter(Boolean);
        return { success: true, data: favoriteWineries };
    } catch (error) {
        console.error("Get Favorites Server Action Error:", error);
        return { success: false, error: "An unexpected error occurred.", data: [] };
    }
}

/**
 * Toggles a winery in the wishlist for the current user.
 * If the winery is already in the wishlist, it will be removed.
 * If not, it will be added.
 * Handles creating the winery in the database if it doesn't exist via RPC.
 *
 * @param wineryData - The data of the winery to toggle.
 * @param skipRevalidation - If true, skips Next.js cache revalidation.
 * @returns An object indicating success or failure.
 */
export async function toggleWishlist(wineryData: WineryData, skipRevalidation = false) {
    const user = await getUser();
    if (!user) {
        return { success: false, error: "Unauthorized" };
    }

    const supabase = await createClient();

    try {
        // Step 1: Ensure winery exists
        const { data: wineryId, error: rpcError } = await supabase
            .rpc('ensure_winery', { p_winery_data: wineryData });

        if (rpcError) {
            console.error("Error ensuring winery via RPC:", rpcError);
            return { success: false, error: "Failed to ensure winery existence." };
        }
        
        const wineryIdInt = wineryId as number;

        // Step 2: Check if already in wishlist
        const { data: existingItem, error: checkError } = await supabase
            .from("wishlist")
            .select("id")
            .eq("user_id", user.id)
            .eq("winery_id", wineryIdInt)
            .maybeSingle();

        if (checkError) {
            console.error("Error checking wishlist status:", checkError);
            return { success: false, error: "Failed to check wishlist status." };
        }

        if (existingItem) {
            // Remove
            const { error: deleteError } = await supabase
                .from("wishlist")
                .delete()
                .eq("user_id", user.id)
                .eq("winery_id", wineryIdInt);

            if (deleteError) {
                console.error("Error removing from wishlist:", deleteError);
                return { success: false, error: "Failed to remove from wishlist." };
            }

            if (!skipRevalidation) {
                revalidatePath('/trips');
                revalidatePath('/');
            }
            return { success: true, message: "Removed from wishlist." };
        } else {
            // Add
            const { error: insertError } = await supabase
                .from("wishlist")
                .insert({ user_id: user.id, winery_id: wineryIdInt });

            if (insertError) {
                console.error("Error adding to wishlist:", insertError);
                return { success: false, error: "Failed to add to wishlist." };
            }

            if (!skipRevalidation) {
                revalidatePath('/trips');
                revalidatePath('/');
            }
            return { success: true, message: "Added to wishlist." };
        }
    } catch (error) {
        console.error("Toggle Wishlist Server Action Error:", error);
        return { success: false, error: "An unexpected error occurred." };
    }
}

/**
 * Handles user login with email and password.
 * @param email The user's email.
 * @param password The user's password.
 * @returns An object indicating success or failure with a message.
 */
export async function login(email: string, password: string) {
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.error("Login Server Action Error:", error);
        return { success: false, message: error.message };
    }

    revalidatePath('/'); // Revalidate homepage after login
    return { success: true, message: "Login successful!" };
}

