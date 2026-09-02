import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Endpoint disabled' }, { status: 404 })
  }

  const internalSecret = process.env.INTERNAL_API_SECRET
  const providedSecret = request.headers.get('x-internal-secret')

  if (!internalSecret || providedSecret !== internalSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid internal secret' },
      { status: 401 }
    )
  }

  return NextResponse.json({ status: 'ok', message: 'Endpoint active in non-production mode' })
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Endpoint disabled' }, { status: 404 })
  }

  const internalSecret = process.env.INTERNAL_API_SECRET
  const providedSecret = request.headers.get('x-internal-secret')

  if (!internalSecret || providedSecret !== internalSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid internal secret' },
      { status: 401 }
    )
  }

  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const supabase = await createAdminClient()

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
