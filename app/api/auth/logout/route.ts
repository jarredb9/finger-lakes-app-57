import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // THE FIX: Instead of a hardcoded URL, we dynamically get the URL
  // from the incoming request. This works in both development and production.
  const requestUrl = new URL(request.url)
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`

  // Now we redirect to the correct login page URL.
  return NextResponse.redirect(`${baseUrl}/login`)
}