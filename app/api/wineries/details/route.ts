import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('place_id');

  if (!placeId) {
    return NextResponse.json({ error: 'Missing place_id parameter' }, { status: 400 });
  }

  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY; // Ensure this is set in your .env.local

  if (!GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: 'Google Maps API Key not configured' }, { status: 500 });
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,international_phone_number,website,rating&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK') {
      const result = data.result;
      const wineryDetails = {
        id: placeId,
        name: result.name,
        address: result.formatted_address,
        phone: result.international_phone_number,
        website: result.website,
        rating: result.rating,
      };
      return NextResponse.json(wineryDetails);
    } else {
      return NextResponse.json({ error: data.status, message: data.error_message }, { status: response.status });
    }
  } catch (error) {
    console.error('Error fetching place details:', error);
    return NextResponse.json({ error: 'Failed to fetch place details' }, { status: 500 });
  }
}
