---
status: proposed
---

# Decoupled Trip Stops and Explicitly Logged Visits

A planned Trip Stop represents prospective itinerary intent, whereas a Visit represents confirmed historical attendance by a specific Visitor on or before today. Even after a Trip's scheduled calendar date passes, Trip Stops must never auto-convert into Visits or mutate in place into attendance records, as doing so would fabricate ghost Visits when plans change and conflate individual attendance across multi-user Trips shared with Trip Collaborators. Instead, Trip Stop completion is derived by matching explicitly logged Visits (via optional `trip_id` attribution or `(winery_id, visit_date)` correlation per Visitor), preserving itinerary history independently from personal Visit logs.
