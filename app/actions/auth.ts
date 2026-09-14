"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { headers } from "next/headers";

export type ActionState<T = unknown> = {
  success: boolean;
  error: string | null;
  fieldErrors?: Record<string, string[]>;
  data?: T;
};

function extractField(
  formData: FormData | Record<string, unknown>,
  key: string
): string {
  if (typeof formData === "object" && formData !== null) {
    if (formData instanceof FormData) {
      return ((formData.get(key) as string) || "").trim();
    }
    const val = formData[key];
    return (typeof val === "string" ? val : "").trim();
  }
  return "";
}

/**
 * React 19 Server Action for user authentication with email and password.
 * Catches all AuthErrors and serializes them as plain string error states
 * to prevent Next.js Flight protocol serialization crashes (FM-6.1).
 */
export async function loginAction(
  _prevState: ActionState | null | undefined,
  formData: FormData | { email?: string; password?: string }
): Promise<ActionState> {
  const email = extractField(formData, "email");
  const password =
    formData instanceof FormData
      ? (formData.get("password") as string) || ""
      : formData?.password || "";

  if (!email || !password) {
    return {
      success: false,
      error: "Please enter both email and password",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      error: null,
    };
  } catch (err: unknown) {
    const error = err as { message?: string } | null;
    // eslint-disable-next-line no-console
    console.error("Login action error:", err);
    return {
      success: false,
      error: error?.message || "An unexpected error occurred. Please try again.",
    };
  }
}

/**
 * React 19 Server Action for password reset email requests.
 */
export async function forgotPasswordAction(
  _prevState: ActionState | null | undefined,
  formData: FormData | { email?: string }
): Promise<ActionState<{ message: string }>> {
  const email = extractField(formData, "email");

  if (!email) {
    return {
      success: false,
      error: "Please enter your email address.",
    };
  }

  try {
    let redirectTo = "http://localhost:3000/reset-password";
    try {
      const headerList = await headers();
      const host = headerList.get("host") || "localhost:3000";
      const proto = headerList.get("x-forwarded-proto") || "http";
      redirectTo = `${proto}://${host}/reset-password`;
    } catch {
      if (process.env.NEXT_PUBLIC_SITE_URL) {
        redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`;
      }
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      error: null,
      data: {
        message:
          "If an account with this email exists, a password reset link has been sent.",
      },
    };
  } catch (err: unknown) {
    const error = err as { message?: string } | null;
    // eslint-disable-next-line no-console
    console.error("Forgot password action error:", err);
    return {
      success: false,
      error: error?.message || "An error occurred. Please try again.",
    };
  }
}

/**
 * React 19 Server Action for manual account confirmation (dev/testing environment only).
 */
export async function manualConfirmAction(
  _prevState: ActionState | null | undefined,
  formData: FormData | { email?: string }
): Promise<ActionState<{ message: string }>> {
  const email = extractField(formData, "email");

  if (!email) {
    return {
      success: false,
      error: "Please enter your email address",
    };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      success: false,
      error:
        "Manual confirmation is disabled in production. Please check your email for the confirmation link.",
    };
  }

  try {
    const supabase = await createAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(email, {
      email_confirm: true,
    });

    if (error) {
      return {
        success: false,
        error:
          error.message ||
          "Could not confirm account. The user may not exist or may already be confirmed.",
      };
    }

    return {
      success: true,
      error: null,
      data: {
        message: "Account confirmed! You can now sign in.",
      },
    };
  } catch (err: unknown) {
    const error = err as { message?: string } | null;
    // eslint-disable-next-line no-console
    console.error("Manual confirm action error:", err);
    return {
      success: false,
      error: error?.message || "An error occurred. Please try again.",
    };
  }
}
