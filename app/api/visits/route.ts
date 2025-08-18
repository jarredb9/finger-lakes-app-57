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
    
    console.log("Received payload at /api/visits:", JSON.stringify(body, null, 2));

    const { wineryData, visit_date, user_review, rating, photos } = body

    if (!wineryData || !wineryData.id || !visit_date) {
      console.error("Validation failed on incoming request:", {
        hasWineryData: !!wineryData,
        hasWineryId: !!wineryData?.id,
        hasVisitDate: !!visit_date,
      });
      return NextResponse.json(
        { error: "Missing required fields: wineryData, visit_date" },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    let wineryId: number;
    const { data: existingWinery, error: findError } = await supabase
      .from("wineries")
      .select("id")
      .eq("google_place_id", wineryData.id)
      .single()

    if (findError && findError.code !== 'PGRST116') {
        throw findError;
    }

    if (existingWinery) {
      wineryId = existingWinery.id
    } else {
      const { data: newWinery, error: insertError } = await supabase
        .from("wineries")
        .insert({
          google_place_id: wineryData.id,
          name: wineryData.name,
          address: wineryData.address,
          latitude: wineryData.lat,
          longitude: wineryData.lng,
          phone: wineryData.phone,
          website: wineryData.website,
          google_rating: wineryData.rating,
        })
        .select("id")
        .single()
      
      if (insertError) throw insertError;
      wineryId = newWinery!.id
    }

    const visitData = {
      user_id: user.id,
      winery_id: wineryId,
      visit_date: visit_date,
      user_review: user_review || null,
      rating: rating || null,
      photos: photos || null,
    }

    const { data, error } = await supabase.from("visits").insert(visitData).select()

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, visit: data })
  } catch (error) {
    console.error("Internal error creating visit:", error)
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: "Internal server error", details: errorMessage }, { status: 500 })
  }
}