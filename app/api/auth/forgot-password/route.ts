import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const { email } = await request.json()
  const requestUrl = new URL(request.url)
  // This is the critical line that creates the correct, full URL
  const redirectTo = `${requestUrl.origin}/reset-password`

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 })
  }

  const supabase = createClient()
  // Here we pass the full URL to Supabase
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })

  if (error) {
    console.error("Error sending password reset email:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ message: "Password reset email sent" })
}
