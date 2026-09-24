# Winery Visit Planning & Tracking

A platform for discovering Finger Lakes wineries, planning day trips, and logging historical tasting visits.

## Core Lifecycle

**Winery**:
A commercial establishment producing or offering wine tasting in the region.
_Avoid_: Venue, place, location, vineyard

**Visit**:
A historical record of a user physically attending a winery on or before today, containing personal impressions such as a rating, notes, or photos.
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

**Visitor**:
The user who authored and logged a Visit.
_Avoid_: Attendee, participant, customer

**Visit Participant**:
A companion user tagged as having attended a Visit alongside the Visitor.
_Avoid_: Member, guest, follower

## User Collections

**Wishlist**:
A collection of unvisited wineries a user intends or aspires to visit in the future.
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
The audience permitted to view a user's profile, visits, or lists: Public, Friends Only, or Private.
_Avoid_: Permission, ACL, scope

## Catalog & Wine Profile

**Place**:
An external location candidate retrieved from Google Places before or during catalog synchronization.
_Avoid_: Venue, POI, spot

**Enrichment**:
Cached, supplementary winery metadata—such as varietals, vibe tags, AI summaries, and accessibility—retrieved from external services and refreshed periodically.
_Avoid_: Augmentation, scraping, scraping cache

**Varietal**:
A specific grape or wine variety produced or poured by a Winery (e.g., Riesling, Cabernet Franc).
_Avoid_: Grape, blend, wine type

**Vibe Tag**:
A descriptive ambiance or lifestyle amenity associated with a Winery (e.g., dog-friendly, scenic views).
_Avoid_: Feature, tag, label, amenity
