import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getUser } from "@/lib/auth"

// GET endpoint to fetch all favorite items for a user
export async function GET() {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("favorites")
      .select("wineries(*)") // Fetch all columns from the joined wineries table
      .eq("user_id", user.id)

    if (error) throw error;

    // Return the full winery objects
    return NextResponse.json(data.map(item => item.wineries).filter(Boolean) || [])
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST endpoint to add an item to the favorites
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { wineryData } = await request.json();
  if (!wineryData) return NextResponse.json({ error: "Winery data is required" }, { status: 400 });

  const supabase = await createClient();

  try {
    // Step 1: Find or Create the winery in the public.wineries table
    let { data: winery, error: findError } = await supabase
      .from("wineries")
      .select("id")
      .eq("google_place_id", wineryData.id)
      .single();

    if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows found
      throw findError;
    }

    if (!winery) {
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
        .single();

      if (insertError) throw insertError;
      winery = newWinery;
    }

    // Step 2: Add the winery to the user's favorites
    const { error: favoriteError } = await supabase
      .from("favorites")
      .insert({ user_id: user.id, winery_id: winery.id });

    if (favoriteError) {
      // Ignore unique constraint errors, means it's already on the list
      if (favoriteError.code === '23505') {
        return NextResponse.json({ success: true, message: "Already a favorite." });
      }
      throw favoriteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Favorite POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE endpoint to remove an item from the favorites
export async function DELETE(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dbId } = await request.json();
  if (!dbId) return NextResponse.json({ error: "Winery DB ID is required" }, { status: 400 });
  
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("winery_id", dbId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Favorite DELETE Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}