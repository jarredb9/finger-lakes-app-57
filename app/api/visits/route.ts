import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const { data: visits, error } = await supabase
      .from("visits")
      .select("*")
      .eq("user_id", user.id)
      .order("visit_date", { ascending: false })

    if (error) {
      console.error("Error fetching visits:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(visits || [])
  } catch (error) {
    console.error("Internal error fetching visits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { wineryId, visitDate, userReview, rating, photos } = body

    if (!wineryId || !visitDate) {
      return NextResponse.json(
        { error: "Missing required fields: wineryId, visitDate" },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const visitData = {
      user_id: user.id,
      winery_id: wineryId,
      visit_date: visitDate,
      user_review: userReview || null,
      rating: rating || null,
      photos: photos || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from("visits").insert(visitData).select()

    if (error) {
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, visit: data })
  } catch (error) {
    console.error("Internal error creating visit:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}