import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { placeId } = await request.json();
  
  // Use service role key to bypass RLS for writing to the public wineries catalog
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (!placeId) {
    console.error('[API] /api/wineries/details: placeId is missing.');
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 });
  }

  // Check if the winery already exists and has details
  const { data: existingWinery, error: selectError } = await supabaseAdmin
    .from('wineries')
    .select('*')
    .eq('google_place_id', placeId)
    .single();

  if (selectError && selectError.code !== 'PGRST116') { // Ignore 'not found' error
    console.error('[API] /api/wineries/details: Error checking for existing winery:', selectError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (existingWinery && existingWinery.phone && existingWinery.website && existingWinery.google_rating && existingWinery.opening_hours !== null && existingWinery.reviews !== null && existingWinery.reservable !== null) {
    return NextResponse.json(existingWinery);
  }

  // Fetch from Google Places API
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[API] /api/wineries/details: Google Maps API Key is not set.');
    return NextResponse.json({ error: 'Google Maps API Key is not configured.' }, { status: 500 });
  }
  // Removed 'reservable' from fields as it may cause INVALID_REQUEST on some API versions/SKUs when explicitly requested in fields
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,formatted_phone_number,website,rating,opening_hours,reviews&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('[API] /api/wineries/details: Google Places API returned non-OK status:', data.status, data.error_message);
      return NextResponse.json({ error: 'Failed to fetch from Google Places API', details: data.status, google_error: data.error_message }, { status: 500 });
    }

    const placeDetails = data.result;

    if (!placeDetails || !placeDetails.name || !placeDetails.formatted_address) {
      console.error('[API] /api/wineries/details: Google Places API result is missing required fields (name or address).', placeDetails);
      return NextResponse.json({ error: 'Incomplete place details from Google' }, { status: 500 });
    }

    const wineryData = {
      google_place_id: placeId,
      name: placeDetails.name,
      address: placeDetails.formatted_address,
      latitude: placeDetails.geometry?.location?.lat,
      longitude: placeDetails.geometry?.location?.lng,
      phone: placeDetails.formatted_phone_number ? placeDetails.formatted_phone_number.substring(0, 50) : null,
      website: placeDetails.website ? placeDetails.website.substring(0, 500) : null,
      google_rating: placeDetails.rating,
      opening_hours: placeDetails.opening_hours ? JSON.parse(JSON.stringify(placeDetails.opening_hours)) : null,
      reviews: placeDetails.reviews ? placeDetails.reviews.slice(0, 5) : null,
      // reservable field removed from fetch
    };

    // Upsert winery data into the database
    const { data: upsertedWinery, error: upsertError } = await supabaseAdmin
      .from('wineries')
      .upsert(wineryData, { onConflict: 'google_place_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('[API] /api/wineries/details: Error upserting winery:', upsertError);
      return NextResponse.json({ error: 'Failed to save winery details', details: upsertError }, { status: 500 });
    }

    return NextResponse.json(upsertedWinery);
  } catch (error) {
    console.error('[API] /api/wineries/details: Error fetching or processing winery details:', error);
    return NextResponse.json({ error: 'Internal server error', details: (error as Error).message }, { status: 500 });
  }
}