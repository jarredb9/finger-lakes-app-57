# Winery Visit Planning & Tracking

A platform for discovering wineries globally, planning day trips, and logging historical tasting visits (with Finger Lakes, NY as the initial default region).

## Core Lifecycle

**Winery**:
A commercial establishment producing or offering wine tasting in any wine region worldwide.
_Avoid_: Venue, place, location, vineyard

**Visit**:
A historical record of a user physically attending a winery on or before today, containing personal impressions such as a rating, notes, or photos. Invariant: If a data source reports `user_visited: false`, any cached visit records for that winery are cleared (ghost visit prevention).
_Avoid_: Check-in, trip stop, attendance, booking

**Visit Note**:
A personal written reflection or tasting record of a user's experience during a Visit.
_Avoid_: Review, venue critique, comment, feedback

**Visit Rating**:
A personal 1-to-5 star evaluation of a user's experience during a Visit.
_Avoid_: Winery rating, business score, venue grade

**Trip**:
A scheduled itinerary of planned winery stops for a specific calendar date, organized by an owner and optionally shared with collaborators.
_Avoid_: Tour, outing, route, journey

**Trip Stop**:
A single planned destination within a Trip, specifying a Winery, its sequence in the itinerary, and planning notes.
_Avoid_: Visit, waypoint, destination, trip winery

**Trip Navigation**:
The action of launching an external turn-by-turn navigation application to guide a user along a Trip's sequence of planned Trip Stops.
_Avoid_: Maps export, trip export, GPS export, route export

**Navigation Provider**:
An external turn-by-turn navigation mapping service (such as Apple Maps, Google Maps, or Waze) selected by the user to route a Trip.
_Avoid_: Map provider, routing service, export target

**Visitor**:
The user who authored and logged a Visit.
_Avoid_: Attendee, participant, customer

**Visit Participant**:
A companion user tagged as having attended a Visit alongside the Visitor.
_Avoid_: Member, guest, follower

## User Collections

**Wishlist**:
A collection of wineries a user intends or aspires to visit in the future. Once visited, entries are automatically cleared unless manually re-added to plan a return visit.
_Avoid_: Bucket list, bookmark, to-do

**Favorite**:
A winery personally designated by a user as a preferred establishment.
_Avoid_: Star, like, bookmark

## Social & Privacy

**Friend**:
A registered user with whom a bidirectional, mutual connection has been established.
_Avoid_: Follower, following, contact, connection

**Friend Request**:
An invitation sent by one user to another to establish a mutual friendship.
_Avoid_: Follow request, invite, link request

**Friend Activity**:
A chronological feed of visits, ratings, or favorites shared by a user's Friends.
_Avoid_: Follower feed, timeline, wall

**Visibility Level**:
The audience of signed-in users permitted to view a user's profile, visits, or lists: Public (any signed-in user), Friends Only (accepted Friends), or Private (only the owner). Unauthenticated visitors have no visibility into any user or catalog data.
_Avoid_: Permission, ACL, scope

## Catalog & Wine Profile

**Place**:
An external location candidate retrieved from Google Places before or during catalog synchronization.
_Avoid_: Venue, POI, spot

**Enrichment**:
Cached, supplementary winery metadata—such as varietals, vibe tags, AI summaries, and accessibility—retrieved from external services and refreshed periodically.
_Avoid_: Augmentation, scraping, scraping cache

**Enrichment Tier**:
The classification level of supplementary metadata associated with a Winery: `basic` (core directory details), `enriched` (curated amenities and vibe tags), or `full` (comprehensive varietals, reviews, and detailed operational attributes).
_Avoid_: Quality score, catalog grade, data level

**Varietal**:
A specific grape or wine variety produced or poured by a Winery (e.g., Riesling, Cabernet Franc).
_Avoid_: Grape, blend, wine type

**Amenity**:
A structured operational or facility attribute of a Winery (e.g., Dogs Allowed, EV Charging, Outdoor Seating, Kid Friendly). Invariant: Tri-state boolean (`true` = confirmed present, `false` = confirmed absent, `null` = un-enriched/unknown); un-enriched or unreported attributes must retain `null` and never be coerced to `false`, and downstream filtering strictly matches `=== true`.
_Avoid_: Feature, vibe tag, facility flag, attribute

**Vibe Tag**:
A curated descriptive phrase capturing a Winery's ambiance, character, or wine specialty (e.g., Riesling Specialist, Scenic Views, Cozy Atmosphere), distinct from structured Amenities.
_Avoid_: Amenity, feature, label, category

**Operational Hours**:
The structured weekly schedule of open and close periods and weekday descriptions associated with a Winery.
_Avoid_: Operating hours, business hours, schedule

**Operational Status**:
The real-time determination (Open, Closed, or Hours Unavailable) of whether a Winery is currently admitting visitors based on its Operational Hours.
_Avoid_: Open/closed tag, business state, venue status

## Client Environment

**Standalone Mode**:
The runtime display mode where the application runs as an installed client without browser navigation chrome, launched from an operating system surface or home screen shortcut (detected across platforms via standalone runtime signals, display-mode media queries, or native app referrers).
_Avoid_: PWA mode, app mode, webclip mode, offline shell

**Browser Mode**:
The runtime display mode where the application runs within a standard web browser window containing address bar and browser navigation controls.
_Avoid_: Web mode, tab mode, normal mode

