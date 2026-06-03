import { googleV1ToWinery } from '../../../utils/adapters/google-v1';
import { GoogleV1Place } from '../../../types';

describe('Google V1 Adapter', () => {
  const mockPlace: GoogleV1Place = {
    id: 'place_123',
    displayName: {
      text: 'Test Winery',
      languageCode: 'en',
    },
    formattedAddress: '123 Wine Lane, Finger Lakes, NY',
    location: {
      latitude: 42.123,
      longitude: -76.456,
    },
    viewport: {
      low: { latitude: 42.1, longitude: -76.5 },
      high: { latitude: 42.2, longitude: -76.4 },
    },
    types: ['winery', 'establishment'],
    rating: 4.5,
    websiteUri: 'https://testwinery.com',
    servesWine: true,
    allowsDogs: true,
    outdoorSeating: true,
    generativeSummary: {
      overview: {
        text: 'A beautiful winery with great views.',
        languageCode: 'en',
      },
    },
    photos: [
      {
        name: 'places/place_123/photos/photo_abc',
        widthPx: 1000,
        heightPx: 1000,
        authorAttributions: [],
      },
      {
        name: 'places/place_123/photos/photo_xyz',
        widthPx: 1000,
        heightPx: 1000,
        authorAttributions: [],
      },
    ],
  };

  it('should correctly map GoogleV1Place to Winery interface', () => {
    const winery = googleV1ToWinery(mockPlace);

    expect(winery.id).toBe('place_123');
    expect(winery.name).toBe('Test Winery');
    expect(winery.address).toBe('123 Wine Lane, Finger Lakes, NY');
    expect(winery.latitude).toBe(42.123);
    expect(winery.longitude).toBe(-76.456);
    expect(winery.website).toBe('https://testwinery.com');
    expect(winery.rating).toBe(4.5);
    expect(winery.serves_wine).toBe(true);
    expect(winery.allows_dogs).toBe(true);
    expect(winery.outdoor_seating).toBe(true);
    expect(winery.generative_summary).toBe('A beautiful winery with great views.');
    expect(winery.primary_photo_reference).toBe('places/place_123/photos/photo_abc');
    expect(winery.photo_references).toEqual([
      'places/place_123/photos/photo_abc',
      'places/place_123/photos/photo_xyz',
    ]);
  });

  it('should strip legacy lat/lng keys if present in any intermediate objects', () => {
    // This is more about ensuring our implementation doesn't accidentally include them
    const winery = googleV1ToWinery(mockPlace);
    expect(winery).not.toHaveProperty('lat');
    expect(winery).not.toHaveProperty('lng');
  });

  it('should handle missing optional fields gracefully', () => {
    const minimalPlace: GoogleV1Place = {
      id: 'place_456',
      displayName: { text: 'Minimal Winery', languageCode: 'en' },
      formattedAddress: 'Address',
      location: { latitude: 1, longitude: 1 },
      viewport: { low: { latitude: 0, longitude: 0 }, high: { latitude: 2, longitude: 2 } },
      types: [],
    };

    const winery = googleV1ToWinery(minimalPlace);
    expect(winery.name).toBe('Minimal Winery');
    expect(winery.generative_summary).toBeNull();
    expect(winery.allows_dogs).toBeNull();
  });
});
