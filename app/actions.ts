"use server"

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

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