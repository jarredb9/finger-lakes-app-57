/**
 * Google Maps Places API (New) Field Masks
 * 
 * These field masks are used to optimize API calls by requesting only the necessary fields.
 * Requesting only what is needed helps manage costs and improves performance.
 */

/**
 * Essentials SKU: Basic fields for identification and location.
 */
export const ESSENTIALS_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.viewport',
  'places.types',
  'places.formattedAddress',
  'places.photos',
];

/**
 * Enrichment SKU: Advanced fields for AI-powered summaries, reviews, and detailed attributes.
 */
export const ENRICHMENT_FIELD_MASK = [
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
];
