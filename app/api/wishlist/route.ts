import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getUser } from "@/lib/auth"

// GET endpoint to fetch all wishlist items for a user
export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("wishlist")
      .select("winery_id")
      .eq("user_id", user.id)

    if (error) throw error;

    return NextResponse.json(data.map(item => item.winery_id))
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST endpoint to add an item to the wishlist
export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { winery_id } = await request.json()
    if (!winery_id) {
      return NextResponse.json({ error: "Winery ID is required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("wishlist")
      .insert({ user_id: user.id, winery_id: winery_id })

    if (error) throw error;

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE endpoint to remove an item from the wishlist
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { winery_id } = await request.json()
    if (!winery_id) {
      return NextResponse.json({ error: "Winery ID is required" }, { status: 400 })
    }
    
    const supabase = await createClient()
    const { error } = await supabase
      .from("wishlist")
      .delete()
      .eq("user_id", user.id)
      .eq("winery_id", winery_id)

    if (error) throw error;

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}