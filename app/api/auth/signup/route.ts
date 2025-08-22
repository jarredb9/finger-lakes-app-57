import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json()

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long" }, { status: 400 })
    }

    const supabase = await createClient()

    console.log("Attempting to sign up user:", email)

    // Check if user already exists first
    const { data: existingUser } = await supabase.auth.signInWithPassword({
      email,
      password: "dummy", // This will fail but tell us if user exists
    })

    // Try to sign up the user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
        },
      },
    })

    if (error) {
      console.error("Signup error:", error)

      // Handle case where user already exists
      if (error.message.includes("User already registered")) {
        return NextResponse.json({
          success: true,
          userExists: true,
          message: "Account already exists. Try signing in, or if that fails, the account may need email confirmation.",
        })
      }

      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.log("Signup response:", {
      user: data.user?.email,
      session: !!data.session,
      confirmed: !!data.user?.email_confirmed_at,
    })

    // If we have a session, user is ready to go
    if (data.session) {
      console.log("User signed up and logged in successfully")
      return NextResponse.json({ success: true })
    }

    // If user was created but no session, they need confirmation
    if (data.user && !data.session) {
      console.log("User created but email confirmation required")

      return NextResponse.json({
        success: true,
        needsConfirmation: true,
        userId: data.user.id,
        message:
          "Account created but requires email confirmation. Since email is not configured, you can try the manual confirmation below.",
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}