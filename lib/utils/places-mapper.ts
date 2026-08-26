/**
 * Defensively extracts latitude from various Google Place / SDK object shapes.
 */
export function extractLatitude(place: any): number {
  if (!place) return 0;
  if (place.location) {
    if (typeof place.location.lat === "function") return place.location.lat();
    if (typeof place.location.latitude === "number") return place.location.latitude;
    if (typeof place.location.lat === "number") return place.location.lat;
  }
  if (place.geometry?.location) {
    if (typeof place.geometry.location.lat === "function") return place.geometry.location.lat();
    if (typeof place.geometry.location.latitude === "number") return place.geometry.location.latitude;
    if (typeof place.geometry.location.lat === "number") return place.geometry.location.lat;
  }
  if (place.latitude !== undefined && place.latitude !== null) return Number(place.latitude);
  if (place.lat !== undefined && place.lat !== null) return Number(place.lat);
  return 0;
}

/**
 * Defensively extracts longitude from various Google Place / SDK object shapes.
 */
export function extractLongitude(place: any): number {
  if (!place) return 0;
  if (place.location) {
    if (typeof place.location.lng === "function") return place.location.lng();
    if (typeof place.location.longitude === "number") return place.location.longitude;
    if (typeof place.location.lng === "number") return place.location.lng;
  }
  if (place.geometry?.location) {
    if (typeof place.geometry.location.lng === "function") return place.geometry.location.lng();
    if (typeof place.geometry.location.longitude === "number") return place.geometry.location.longitude;
    if (typeof place.geometry.location.lng === "number") return place.geometry.location.lng;
  }
  if (place.longitude !== undefined && place.longitude !== null) return Number(place.longitude);
  if (place.lng !== undefined && place.lng !== null) return Number(place.lng);
  if (place.long !== undefined && place.long !== null) return Number(place.long);
  return 0;
}

/**
 * Normalizes summary objects (generative, neighborhood, editorial) into { overview: { text: string } }.
 */
function extractSummary(summary: any): { overview: { text: string } } | null {
  if (!summary) return null;
  if (typeof summary === "string") return { overview: { text: summary } };
  if (summary.overview?.text) return { overview: { text: summary.overview.text } };
  if (summary.text) return { overview: { text: summary.text } };
  return null;
}

/**
 * Pure function mapping Google Places SDK Place object to an intermediate
 * V1 place representation compatible with `standardizeWineryData`.
 */
export function mapSdkPlaceToV1Place(
  place: any,
  fallbackText: string = "",
  timestamp: string = new Date().toISOString()
): Record<string, any> {
  if (!place) return {};

  const name =
    (typeof place.displayName === "string"
      ? place.displayName
      : place.displayName?.text) ||
    place.name ||
    fallbackText ||
    "";

  const v1Place: Record<string, any> = {
    google_place_id: place.id || place.place_id,
    name,
    address: place.formattedAddress || place.formatted_address || place.address || "",
    latitude: extractLatitude(place),
    longitude: extractLongitude(place),
    phone:
      place.nationalPhoneNumber ||
      place.internationalPhoneNumber ||
      place.international_phone_number ||
      place.phone ||
      null,
    website: place.websiteUri || place.website || null,
    google_rating: place.rating ?? place.google_rating ?? null,
    user_rating_count: place.userRatingCount ?? place.user_rating_count ?? null,
    allows_dogs: place.allowsDogs ?? place.allows_dogs ?? null,
    serves_wine: place.servesWine ?? place.serves_wine ?? null,
    good_for_children:
      place.isGoodForChildren ??
      place.goodForChildren ??
      place.good_for_children ??
      null,
    outdoor_seating:
      place.hasOutdoorSeating ??
      place.outdoorSeating ??
      place.outdoor_seating ??
      null,
    enrichment_tier: "enriched",
    last_enriched_at: timestamp,
  };

  // Photo references
  if (place.photos && Array.isArray(place.photos) && place.photos.length > 0) {
    v1Place.primary_photo_reference = place.photos[0].name;
    v1Place.photo_references = place.photos.map((p: any) => p.name);
  }

  // Summaries
  const genSummary = extractSummary(place.generativeSummary || place.generative_summary);
  if (genSummary) v1Place.generative_summary = genSummary;

  const neighSummary = extractSummary(place.neighborhoodSummary || place.neighborhood_summary);
  if (neighSummary) v1Place.neighborhood_summary = neighSummary;

  const editSummary = extractSummary(place.editorialSummary || place.editorial_summary);
  if (editSummary) v1Place.editorial_summary = editSummary;

  // Parking & EV charging
  if (place.parkingOptions || place.parking_options) {
    v1Place.parking_options = place.parkingOptions || place.parking_options;
  }

  if (place.evChargeOptions || place.ev_charge_options) {
    const ev = place.evChargeOptions || place.ev_charge_options;
    v1Place.ev_charge_options = ev;
    v1Place.has_ev_charging = (ev.connectorCount || 0) > 0;
  } else if (place.parkingOptions?.hasEvChargingStations !== undefined) {
    v1Place.has_ev_charging = place.parkingOptions.hasEvChargingStations;
  } else if (place.has_ev_charging !== undefined) {
    v1Place.has_ev_charging = place.has_ev_charging;
  }

  // Accessibility (map JS SDK `has*` to REST/standard `wheelchairAccessible*`)
  if (place.accessibilityOptions || place.accessibility_options) {
    const acc = place.accessibilityOptions || place.accessibility_options;
    v1Place.accessibility_options = {
      wheelchairAccessibleEntrance:
        acc.hasWheelchairAccessibleEntrance ?? acc.wheelchairAccessibleEntrance ?? null,
      wheelchairAccessibleParking:
        acc.hasWheelchairAccessibleParking ?? acc.wheelchairAccessibleParking ?? null,
      wheelchairAccessibleRestroom:
        acc.hasWheelchairAccessibleRestroom ?? acc.wheelchairAccessibleRestroom ?? null,
      wheelchairAccessibleSeating:
        acc.hasWheelchairAccessibleSeating ?? acc.wheelchairAccessibleSeating ?? null,
    };
    v1Place.accessibility_flags = v1Place.accessibility_options;
  }

  // Opening hours & reviews
  if (place.regularOpeningHours || place.opening_hours) {
    v1Place.opening_hours = place.regularOpeningHours || place.opening_hours;
  }

  if (place.reviews) {
    v1Place.reviews = place.reviews;
  }

  return v1Place;
}
