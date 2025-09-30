import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Try to manually confirm the user using service role key
    const { error } = await supabase.auth.admin.updateUserById(email, {
      email_confirm: true,
    })

    if (error) {
      console.error("Manual confirmation error:", error)
      return NextResponse.json({ error: "Could not confirm user" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "User confirmed successfully" })
  } catch (error) {
    console.error("Confirmation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
