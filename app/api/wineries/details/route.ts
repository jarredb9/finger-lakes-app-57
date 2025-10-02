import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { placeId } = await request.json();
  const supabase = await createClient();

  if (!placeId) {
    console.error('[API] /api/wineries/details: placeId is missing.');
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 });
  }

  // Check if the winery already exists and has details
  const { data: existingWinery, error: selectError } = await supabase
    .from('wineries')
    .select('*')
    .eq('google_place_id', placeId)
    .single();

  if (selectError && selectError.code !== 'PGRST116') { // Ignore 'not found' error
    console.error('[API] /api/wineries/details: Error checking for existing winery:', selectError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (existingWinery && existingWinery.phone && existingWinery.website && existingWinery.google_rating) {
    return NextResponse.json(existingWinery);
  }

  // Fetch from Google Places API
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[API] /api/wineries/details: Google Maps API Key is not set.');
    return NextResponse.json({ error: 'Google Maps API Key is not configured.' }, { status: 500 });
  }
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,formatted_phone_number,website,rating&key=${apiKey}`;

  try {
    console.log(`[API] /api/wineries/details: Fetching details for placeId: ${placeId}`);
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('[API] /api/wineries/details: Google Places API returned non-OK status:', data.status, data.error_message);
      return NextResponse.json({ error: 'Failed to fetch from Google Places API', details: data.status, google_error: data.error_message }, { status: 500 });
    }

    const placeDetails = data.result;
    console.log('[API] /api/wineries/details: Fetched place details:', placeDetails);

    const wineryData = {
      google_place_id: placeId,
      name: placeDetails.name,
      address: placeDetails.formatted_address,
      latitude: placeDetails.geometry?.location?.lat,
      longitude: placeDetails.geometry?.location?.lng,
      phone: placeDetails.formatted_phone_number,
      website: placeDetails.website,
      google_rating: placeDetails.rating,
    };
    console.log('[API] /api/wineries/details: Prepared winery data for upsert:', wineryData);

    // Upsert winery data into the database
    const { data: upsertedWinery, error: upsertError } = await supabase
      .from('wineries')
      .upsert(wineryData, { onConflict: 'google_place_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('[API] /api/wineries/details: Error upserting winery:', upsertError);
      return NextResponse.json({ error: 'Failed to save winery details', details: upsertError }, { status: 500 });
    }

    console.log('[API] /api/wineries/details: Upserted winery:', upsertedWinery);

    if (!upsertedWinery) {
      const { data: fetchedWinery, error: fetchError } = await supabase
        .from('wineries')
        .select('*')
        .eq('google_place_id', placeId)
        .single();

      if (fetchError) {
        console.error('[API] /api/wineries/details: Error fetching after upsert:', fetchError);
        return NextResponse.json({ error: 'Failed to fetch winery details after upsert' }, { status: 500 });
      }
      
      console.log('[API] /api/wineries/details: Fetched winery after failed upsert return:', fetchedWinery);
      return NextResponse.json(fetchedWinery);
    }

    return NextResponse.json(upsertedWinery);
  } catch (error) {
    console.error('[API] /api/wineries/details: Error fetching or processing winery details:', error);
    return NextResponse.json({ error: 'Internal server error', details: (error as Error).message }, { status: 500 });
  }
}