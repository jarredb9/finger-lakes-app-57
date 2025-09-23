import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const supabase = createClient()

    console.log("Attempting to sign in user:", email)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error("Login error details:", {
        message: error.message,
        status: error.status,
        email: email,
      })

      // Handle specific error cases
      if (error.message.includes("Email not confirmed")) {
        return NextResponse.json(
          {
            error: "Please confirm your email address before signing in. Check your email for a confirmation link.",
          },
          { status: 401 },
        )
      }

      if (error.message.includes("Invalid login credentials")) {
        return NextResponse.json(
          {
            error: "Invalid email or password. Please check your credentials and try again.",
          },
          { status: 401 },
        )
      }

      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    if (!data.session) {
      console.error("No session created after login")
      return NextResponse.json({ error: "Failed to create session" }, { status: 401 })
    }

    console.log("Login successful for user:", data.user?.email)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}