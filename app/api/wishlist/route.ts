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
      .select("wineries(id, google_place_id)")
      .eq("user_id", user.id)

    if (error) throw error;

    return NextResponse.json(data.map(item => ({ 
        winery_id: item.wineries.id,
        google_place_id: item.wineries.google_place_id
    })))
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST endpoint to add an item to the wishlist
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

    // Step 2: Add the winery to the user's wishlist
    const { error: wishlistError } = await supabase
      .from("wishlist")
      .insert({ user_id: user.id, winery_id: winery.id });

    if (wishlistError) {
      // Ignore unique constraint errors, means it's already on the list
      if (wishlistError.code === '23505') {
        return NextResponse.json({ success: true, message: "Already on wishlist." });
      }
      throw wishlistError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Wishlist POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE endpoint to remove an item from the wishlist
export async function DELETE(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dbId } = await request.json();
  if (!dbId) return NextResponse.json({ error: "Winery DB ID is required" }, { status: 400 });
  
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from("wishlist")
      .delete()
      .eq("user_id", user.id)
      .eq("winery_id", dbId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Wishlist DELETE Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}