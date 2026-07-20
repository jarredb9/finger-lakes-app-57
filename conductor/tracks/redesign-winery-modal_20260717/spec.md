# Specification: Redesign Winery Modal UX/UI (`spec.md`)

## 1. Overview
Redesign the `WineryModal` and its subcomponents (`WineryDetails`, `WineryActionsPresentational`, `FriendActivity`, `FriendRatings`, `TripPlannerSection`, and `VisitCardHistory`) to provide a premium, modern, glassmorphic UI matching the design system of the mobile floating navigation pill. The redesign reorganizes features to optimize viewport space, highlight visual assets, integrate AI insights, consolidate social data, simplify actions, and declutter the user interface.

This specification contains visual wireframes, layout rules, and interaction definitions to serve as the absolute source of truth for the implementing agent.

---

## 2. Visual Layout Wireframes

### A. Desktop Viewport (>= sm / `640px` and up)
```
+---------------------------------------------------------------------------------+
|  🍇 Château Luna Winery                                              (Close [x]) |
|  On Trip: Summer Wine Tour 2026 (Badge)                                         |
+---------------------------------------------------------------------------------+
| LEFT COLUMN: INFO & DETAILS             | RIGHT COLUMN: INTERACTION TABS        |
|                                         |                                       |
|  +-----------------------------------+  |  +---------------------------------+  |
|  | 🖼️ HERO IMAGE & PHOTO GRID        |  |  | Community  Amenities  Visits... |  |
|  | (Scale-on-hover, glass border)    |  |  +---------------------------------+  |
|  +-----------------------------------+  |  | CONTENT FOR ACTIVE TAB:         |  |
|                                         |  |                                 |  |
|  +-----------------------------------+  |  |  * Amenities Tab (Active here): |  |
|  | ⚡ QUICK ACTIONS ROW               |  |  |    - Restrooms: ✅ Yes          |  |
|  | [❤️ Favorite [🔒]] [⭐ Wishlist [🔒]]|  |  |    - Tasting Room: ✅ Yes       |  |
|  | [🌐 Street View] [🔗 Share]        |  |  |    - EV Charging: ❓ Ask-------+--|
|  +-----------------------------------+  |  |    - Dog Friendly: ✅ Yes       |  |  |
|                                         |  |                                 |  |  |
|  +-----------------------------------+  |  |  * Community Tab:               |  |  |
|  | ℹ️ SEGMENTED DETAILS CARD          |  |  |    - Avatars: 🧑‍🦰🧑👩 (Hover Names) |  |  |
|  | +-------------------------------+ |  |  |    - Reviews Feed (Text+Photos) |  |  |
|  | | [ Overview ]  [ AI Insights ] | |  |  |                                 |  |  |
|  | +-------------------------------+ |  |  * Add to Trip Tab:             |  |  |
|  | | 🟢 Open Now   | Contact:      | |  |    - Select Trip & Planner      |  |  |
|  | | 9am - 6pm [v] | 📞 🌐 ✉️       | |  |  +---------------------------------+  |  |
|  | +-------------------------------+ |  |                                       |  |
|  | Address: 123 Vineyard Lane        |  |  +---------------------------------+  |  |
|  | 🚗 [ Route From Current ] Button  |  |  | 🔍 REVIEWS SIDE-SHEET (SLID OUT)|  |<-+
|  +-----------------------------------+  |  |                                 |
|                                         |  |  Question: EV Charging          |
|                                         |  |  "EV charging station works..." |
|                                         |  |  - Jane D. (2 days ago)         |
|                                         |  |                                 |
|                                         |  |  <  1 of 3  >        [Close]    |
|                                         |  +---------------------------------+
+---------------------------------------------------------------------------------+
```

### B. Mobile Viewport (< sm / less than `640px`)
Rendered inside a bottom sheet `Drawer` wrapper.
```
+-----------------------------------+
|  (=) Drag Handle                  |
|                                   |
|  🍇 Château Luna Winery       (X) |  <-- Title & Close Button
|  ⭐ 4.8 (124 reviews)             |
|                                   |
|  +-----------------------------+  |
|  |                             |  |
|  |    🖼️ HERO IMAGE            |  |
|  |                             |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | ❤️ Favorite [🔒] ⭐ Wishlist [🔒]|  |  <-- Redesigned compact privacy locks
|  | 🌐 Street View  🔗 Share       |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | ℹ️ SEGMENTED DETAILS CARD   |  |  <-- Toggleable segment card
|  | +-------------------------+ |  |
|  | | [Overview] [AI Insights]| |  |
|  | +-------------------------+ |  |
|  |  🟢 Open Now  | Contact:  |  |
|  |  9am - 6pm [v]| 📞 🌐 ✉️   |  |  <-- [v] Expandable weekly hours
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | Community  Amenities  ...   |  |  <-- Tab navigation (full width)
|  +-----------------------------+  |
|  | Active Tab Content          |  |  <-- Displays active tab (e.g.
|  | (e.g. Amenities checklist)  |  |      checklist)
|  +-----------------------------+  |
+-----------------------------------+
```

---

## 3. Component Details & Layout Rules

### A. Segmented Details Card (Middle Section)
To prevent vertical space bloat, the contact card and Gemini summary are housed inside a single card with an iOS-style **Segmented Control toggle** at the top.
*   **Pill Segment Switch:** Toggle bar containing `[ Overview ]` and `[ AI Insights ]`. Styled with a solid background and a sliding capsule block so it is visually distinguished from the bottom navigation tabs.
*   **Overview Segment:**
    *   *Open Status Indicator:* A green dot and text label (e.g., `🟢 Open Now`).
    *   *Expandable Hours Trigger:* Dropdown indicator displaying weekly opening text (e.g., `[v]`).
    *   *Contact Icons:* Inline icon row linking Web, Phone, and Email.
    *   *Quick Route Trigger:* A 🚗 [ Route From Current Location ] action button next to the address. This button uses `MapNavigation` to open the map navigation popup, allowing the user to select their preferred routing application (Google Maps, Apple Maps, or Waze).
*   **AI Insights Segment:**
    *   *Gemini Summary:* Highlights the generative AI winery summary in a premium gradient container.
    *   *About the Area:* Shows the neighborhood summary.

---

## 4. Interactive Tabs & Sub-Drawer/Side-Sheet Flow

The right column (desktop) and bottom container (mobile) support four navigation tabs:
*   **Tab 1: Community:** Consolidated Friend Activity and Ratings feed. Displays compact avatar group summaries of friends who favorited/wishlisted this winery at the top. Below the summary, it displays a scrollable feed of detailed friend review cards containing the friend's name, rating stars, written text review, and uploaded photos (retaining all data from `FriendRatings`).
*   **Tab 2: Amenities:** A vertical list of the 8 logistics checklist attributes. 
    *   *Database-backed:* Parking (uses `parking_options`), Dog Friendly (uses `allows_dogs`), EV Charging (uses `has_ev_charging`), and Reservation Required (uses `reservable`).
    *   *Reviews-backed:* Restrooms, Tasting Room, Picnic Area, and Tasting Fee are NOT stored as database columns (and thus require no database schema migrations or changes to `db:populate`). They query Google reviews dynamically using custom keywords configured in `WineryQnA.tsx`.
*   **Tab 3: Visits:** The `+ Log Visit` button and personal visit history. `VisitCardHistory` shows a horizontal strip of photo thumbnails uploaded for each logged visit.
*   **Tab 4: Trip:** The trip planner section. This tab explicitly reuses the existing `TripPlannerSection.tsx` component to allow users to add/remove the winery to/from active or planned trips.

### The Sub-Drawer / Side-Sheet Reviews Portal
Clicking **any** amenity row inside **Tab 2 (Amenities)** triggers a sliding reviews panel:
*   **On Desktop (Side Sheet):**
    *   A side-sheet (`Sheet` component from shadcn/ui) slides in from the **right edge of the modal**, covering the right column tabs while the left info column remains visible.
    *   It contains the selected amenity's reviews, page indicators, and a close button.
*   **On Mobile (Bottom Sheet Drawer):**
    *   A sub-drawer (`Drawer` component from shadcn/ui) slides up from the bottom of the viewport, covering the lower 50% of the screen.
    *   It contains a drag handle and a close button.
*   **Reviews Content:**
    *   Displays the specific amenity question (e.g., "Is EV charging available?").
    *   Queries Google reviews to extract matching snippets, showing text, author name, and publishing date.
    *   **Pagination:** Displays previous (`<`) and next (`>`) arrows to cycle through multiple reviews (e.g. "1 of 3 reviews").
    *   **Dismissal:** Tapping the `X` button, sliding down (on mobile), or clicking a close link closes the sheet.
    *   **No Dropdown Select:** The dropdown question selector is completely removed from the reviews panel UI. Row clicks are the sole trigger to switch topics.

---

## 5. Visual Styling Specs (Tailwind v4)
*   **Anti-Tab Soup Styling (CRITICAL):**
    *   *Navigation Tabs (Bottom):* Styled as borderless, flat text tab triggers. Includes a scrollable flex row (`overflow-x-auto scrollbar-none flex-nowrap`) housing **5 tabs** (Community, Amenities, AI Insights, Visits, Trip). Active tab has no background capsule; it is marked strictly by a colored bottom underline (`border-b-2 border-primary` or a clean colored bar). 
*   **Card Contrast (REVISED):** Use `bg-muted/40 backdrop-blur-md border border-border/50 shadow-sm` for internal cards (overview card, action tiles). This provides visible contrast against the modal background, aligned with the floating navigation pill's design language.
*   **Hero & Title Overlay:** The hero image (`primary_photo_reference`) spans the full width of the modal header without padding/margins (`p-0`). Layered directly over the lower portion of the hero image is a floating translucent card (`bg-background/80 border border-border/50 backdrop-blur-md rounded-2xl mx-4 -mt-8 p-4 text-center z-10 relative`) containing the winery name, rating stars, and short location string (city, state).
*   **Quick Actions Grid:** Action buttons (Favorite, Wishlist, Street View, Share) are displayed as a `grid grid-cols-4 gap-2` of vertical icon+label tiles with `bg-muted/30 rounded-xl border border-border/50` styling. Privacy toggles render as overlay badges. A full-width "Log Visit" outline button is positioned right below the grid.
*   **Contact & Route Card Split:** The Overview card uses a two-column layout: Left (Open status + expandable hours chevron dropdown) | Right (Contact & Route label + row of 4 circular buttons: Phone, Website, Email, and Directions). The directions button wraps `MapNavigation` and triggers the browser map choice popup.
*   **Amenity Row Style:** Amenity rows use clean list style with bottom dividers (`border-b border-border/30 last:border-0`) instead of individually bordered cards.
*   **Micro-Animations:** Buttons, tab triggers, and badge buttons must support smooth hover scaling transitions (`transition-all duration-300 hover:scale-105 active:scale-95`).
*   **DOM Stability:** Skeletons during loading states must match the height and column/layout grid of the finished state (including hero overlay and 4-column tiles), maintaining the `data-state="loading|ready"` structure.

---

## 6. Acceptance Criteria
*   [ ] Hero image is displayed full width at the very top of both mobile and desktop modal layouts.
*   [ ] Translucent card overlays the lower edge of the hero image, housing the winery name, rating, and address.
*   [ ] The winery modal uses visible card contrast (`bg-muted/40 backdrop-blur-md`) consistent with the floating nav pill design language.
*   [ ] On mobile, the modal is rendered inside a drawer component that pulls up from the bottom.
*   [ ] On desktop, the modal presents a split-column view (Left: Hero+Overlay, Info, Segmented Card; Right: Tabbed interaction panel).
*   [ ] The bottom tabs row includes a 5th tab (AI Insights) and is scrollable (`overflow-x-auto scrollbar-none flex-nowrap`) to prevent header squishing.
*   [ ] Quick Actions are displayed as a 4-column grid of square icon+label tiles (not inline button row).
*   [ ] A prominent full-width "Log Visit" outline button is displayed directly below the quick actions.
*   *   [ ] Active and hover states across all action buttons and tiles feature micro-animations.
*   [ ] Tapping any of the 8 logistics rows inside the Amenities Tab triggers a Side-Sheet (desktop) or a Sub-Drawer (mobile) containing paginated reviews.
*   [ ] Amenity rows use clean list dividers, not individually bordered cards.
*   [ ] Standalone `FriendRatings` is merged into the Community Tab, displaying both friend avatars and detailed review text/photos.
*   [ ] Quick Action tiles retain `favorite-privacy-toggle` and `wishlist-privacy-toggle` data-testids as overlay badges.
*   [ ] Overview card uses a two-column split layout: Left (status + expandable hours) | Right (contact labels and 4 circular action buttons: phone, website, email, directions). The directions button uses `route-from-current` test ID.
*   [ ] Loading skeleton matches the column-split structure of the ready modal (including hero image overlay and 4-column grid skeletons).
