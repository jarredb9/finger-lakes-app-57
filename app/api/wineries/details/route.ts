import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { placeId } = await request.json();
  const supabase = createClient();

  if (!placeId) {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 });
  }

  // Check if the winery already exists and has details
  const { data: existingWinery, error: selectError } = await supabase
    .from('wineries')
    .select('*')
    .eq('google_place_id', placeId)
    .single();

  if (selectError && selectError.code !== 'PGRST116') { // Ignore 'not found' error
    console.error('Error checking for existing winery:', selectError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (existingWinery && existingWinery.phone && existingWinery.website && existingWinery.google_rating) {
    return NextResponse.json(existingWinery);
  }

  // Fetch from Google Places API
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,formatted_phone_number,website,rating&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return NextResponse.json({ error: 'Failed to fetch from Google Places API', details: data.status }, { status: 500 });
    }

    const placeDetails = data.result;

    const wineryData = {
      google_place_id: placeId,
      name: placeDetails.name,
      address: placeDetails.formatted_address,
      latitude: placeDetails.geometry.location.lat,
      longitude: placeDetails.geometry.location.lng,
      phone: placeDetails.formatted_phone_number,
      website: placeDetails.website,
      google_rating: placeDetails.rating,
    };

    // Upsert winery data into the database
    const { data: upsertedWinery, error: upsertError } = await supabase
      .from('wineries')
      .upsert(wineryData, { onConflict: 'google_place_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting winery:', upsertError);
      return NextResponse.json({ error: 'Failed to save winery details' }, { status: 500 });
    }

    return NextResponse.json(upsertedWinery);
  } catch (error) {
    console.error('Error fetching or processing winery details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}