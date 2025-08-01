import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Fetching visits for user:", user.id)

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

    console.log("Visits fetched successfully:", visits?.length || 0, "visits")
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
      console.error("Unauthorized visit creation attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { wineryName, wineryAddress, visitDate, userReview } = body

    console.log("Creating new visit:", {
      userId: user.id,
      wineryName,
      visitDate,
      hasReview: !!userReview,
    })

    if (!wineryName || !wineryAddress || !visitDate) {
      console.error("Missing required fields:", {
        wineryName: !!wineryName,
        wineryAddress: !!wineryAddress,
        visitDate: !!visitDate,
      })
      return NextResponse.json(
        { error: "Missing required fields: wineryName, wineryAddress, visitDate" },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // First, let's check if there are any existing visits for this user/winery combination
    const { data: existingVisits, error: checkError } = await supabase
      .from("visits")
      .select("id, visit_date")
      .eq("user_id", user.id)
      .eq("winery_name", wineryName)

    if (checkError) {
      console.error("Error checking existing visits:", checkError)
    } else {
      console.log("Existing visits for this winery:", existingVisits?.length || 0)
    }

    // Insert new visit with a unique timestamp to avoid any potential conflicts
    const visitData = {
      user_id: user.id,
      winery_name: wineryName,
      winery_address: wineryAddress,
      visit_date: visitDate,
      user_review: userReview || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    console.log("Inserting visit data:", visitData)

    const { data, error } = await supabase.from("visits").insert(visitData).select()

    if (error) {
      console.error("Database error creating visit:", error)

      // If it's still a unique constraint error, provide more specific guidance
      if (error.message.includes("duplicate key") || error.message.includes("unique constraint")) {
        return NextResponse.json(
          {
            error:
              "A unique constraint is still preventing multiple visits. Please run the database migration to remove constraints.",
            details: error.message,
          },
          { status: 500 },
        )
      }

      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    console.log("Visit created successfully:", data)
    return NextResponse.json({ success: true, visit: data })
  } catch (error) {
    console.error("Internal error creating visit:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
