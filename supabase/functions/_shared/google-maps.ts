/**
 * Shared constants and utilities for Google Maps API v1 integration.
 */

export const ESSENTIALS_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.viewport',
  'places.types',
  'places.formattedAddress',
  'places.photos',
].join(',');

export const ENRICHMENT_FIELD_MASK = [
  ...ESSENTIALS_FIELD_MASK.split(','),
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
  'places.evChargeOptions',
  'places.rating',
  'places.websiteUri',
  'places.regularOpeningHours',
  'places.internationalPhoneNumber'
].join(',');
