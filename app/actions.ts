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
 * Handles creating the winery in the database if it doesn't exist.
 *
 * @param wineryData - The data of the winery to toggle.
 * @returns An object indicating success or failure.
 */
export async function toggleFavorite(wineryData: WineryData) {
    const user = await getUser();
    if (!user) {
        return { success: false, error: "Unauthorized" };
    }

    const supabase = await createClient();

    try {
        // Step 1: Ensure the winery exists in the public.wineries table (UPSERT)
        const { data: winery, error: upsertWineryError } = await supabase
            .from("wineries")
            .upsert(
                {
                    google_place_id: wineryData.id,
                    name: wineryData.name,
                    address: wineryData.address,
                    latitude: wineryData.lat,
                    longitude: wineryData.lng,
                    phone: wineryData.phone,
                    website: wineryData.website,
                    google_rating: wineryData.rating,
                },
                { onConflict: 'google_place_id' }
            )
            .select("id")
            .single();

        if (upsertWineryError) {
            console.error("Error upserting winery:", upsertWineryError);
            return { success: false, error: "Failed to ensure winery existence." };
        }

        // Step 2: Check if already a favorite and toggle
        const { data: existingFavorite, error: checkFavoriteError } = await supabase
            .from("favorites")
            .select("id")
            .eq("user_id", user.id)
            .eq("winery_id", winery.id)
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
                .eq("winery_id", winery.id);

            if (deleteError) {
                console.error("Error removing favorite:", deleteError);
                return { success: false, error: "Failed to remove favorite." };
            }
            revalidatePath('/trips'); // Revalidate paths that display favorites
            revalidatePath('/'); // For homepage
            return { success: true, message: "Removed from favorites." };
        } else {
            // Not a favorite, so add it
            const { error: insertFavoriteError } = await supabase
                .from("favorites")
                .insert({ user_id: user.id, winery_id: winery.id });

            if (insertFavoriteError) {
                console.error("Error adding favorite:", insertFavoriteError);
                return { success: false, error: "Failed to add favorite." };
            }
            revalidatePath('/trips'); // Revalidate paths that display favorites
            revalidatePath('/'); // For homepage
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

