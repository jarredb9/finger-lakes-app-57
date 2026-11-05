---
status: proposed
---

# Hybrid Global Personal Pins and Viewport-Bounded Catalog Markers

Under global discovery (ADR-0004), every search in any wine region worldwide persists rows into `public.wineries`, making an unbounded `get_map_markers` scan scale poorly in query latency, payload size, and client IndexedDB serialization. However, strictly restricting `get_map_markers` to the active camera bounding box would hide a user's own Visited Wineries, Favorites, Wishlist entries, and planned Trip Stops whenever zoomed out or viewing another region. Map marker hydration therefore separates into two tiers: a user's personal Winery associations (bounded by personal usage) hydrate globally so personal history and collections remain visible across any map extent, while unvisited catalog Wineries query strictly within the active viewport bounds with deterministic result caps.
