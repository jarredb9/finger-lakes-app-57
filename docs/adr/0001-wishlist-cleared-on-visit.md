# Clear Wishlist Entries Upon Visit

Wishlist entries represent purely aspirational, unvisited wineries. When a user logs a Visit to a wishlisted winery, the winery is permanently removed from their Wishlist, and subsequent deletion of the Visit does not restore the Wishlist entry. This avoids contradictory states where a visited winery appears on an aspirational bucket list, while keeping list state strictly monotonic unless manually re-added.
