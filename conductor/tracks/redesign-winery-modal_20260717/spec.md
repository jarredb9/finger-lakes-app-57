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
    *   *Segmented Control (Top):* Styled as an iOS pill switcher (`bg-muted/80 p-0.5 rounded-full`) with a sliding dark/light capsule background for the active toggle.
    *   *Navigation Tabs (Bottom):* Styled as borderless, flat text tab triggers. Active tab has no background capsule; it is marked strictly by a colored bottom underline (`border-b-2 border-primary` or a clean colored bar).
*   **Glassmorphism Container:** Apply `backdrop-blur-md bg-background/85 border border-border/50 shadow-2xl shadow-primary/5` to all modal cards and drawer backgrounds.
*   **Micro-Animations:** Buttons, tab triggers, and badge buttons must support smooth hover scaling transitions (`transition-all duration-300 hover:scale-105 active:scale-98`).
*   **DOM Stability:** Skeletons during loading states must match the height and column/layout grid of the finished state, maintaining the `data-state="loading|ready"` structure.

---

## 6. Acceptance Criteria
*   [ ] The winery modal uses glassmorphic styling (backdrop blur, glowing shadow, subtle borders).
*   [ ] On mobile, the modal is rendered inside a drawer component that pulls up from the bottom with gutters (`w-[95vw]` spacing).
*   [ ] On desktop, the modal presents a split-column view (Left: Info, Segmented Card; Right: Tabbed interaction panel).
*   [ ] The Segmented Control and the bottom tabs are styled distinctly (iOS pill slider vs. underline tabs) to prevent layout conflicts.
*   [ ] Active and hover states across all action buttons feature micro-animations.
*   [ ] Tapping any of the 8 logistics rows inside the Amenities Tab triggers a Side-Sheet (desktop) or a Sub-Drawer (mobile) containing paginated reviews.
*   [ ] Standalone `FriendRatings` is merged into the Community Tab, displaying both friend avatars and detailed review text/photos.
*   [ ] Quick Action bar contains a Share button, and retains decluttered individual padlock toggles (`favorite-privacy-toggle`, `wishlist-privacy-toggle`) for test compatibility.
*   [ ] Overview card includes a "Route From Current Location" trigger that opens the `MapNavigation` popup choice (supporting Google Maps, Apple Maps, and Waze).
*   [ ] `VisitCardHistory` shows horizontal photo thumbnail strips for each logged visit.
*   [ ] Loading skeleton matches the column-split structure of the ready modal exactly.
