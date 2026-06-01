import { ESSENTIALS_FIELD_MASK, ENRICHMENT_FIELD_MASK } from '../../constants/google-maps';

describe('Google Maps Constants', () => {
  it('should have the correct ESSENTIALS_FIELD_MASK', () => {
    const expected = [
      'places.id',
      'places.displayName',
      'places.location',
      'places.viewport',
      'places.types',
      'places.formattedAddress',
      'places.photos',
    ];
    expect(ESSENTIALS_FIELD_MASK).toEqual(expected);
  });

  it('should have the correct ENRICHMENT_FIELD_MASK', () => {
    const expected = [
      'places.generativeSummary',
      'places.neighborhoodSummary',
      'places.editorialSummary',
      'places.servesWine',
      'places.allowsDogs',
      'places.goodForChildren',
      'places.outdoorSeating',
      'places.reviews',
      'places.parkingOptions',
      'places.accessibilityOptions',
    ];
    expect(ENRICHMENT_FIELD_MASK).toEqual(expected);
  });
});
