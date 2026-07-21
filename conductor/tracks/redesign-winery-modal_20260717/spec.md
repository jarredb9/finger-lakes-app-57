# Specification: Redesign Winery Modal UX/UI (`spec.md`)

## 1. Overview
Redesign the `WineryModal` and its subcomponents (`WineryDetails`, `WineryActionsPresentational`, `WineryCommunityTab`, `TripPlannerSection`, `VisitCardHistory`, and `WineryQnA`) to provide a premium, modern, glassmorphic UI matching the design system of the mobile floating navigation pill.

The redesign introduces an **Apple Maps-Style 3-Tier Multi-Snap Drawer System** (`Peek ~30vh`, `Half ~60vh`, `Full ~90vh`) on mobile, a swipeable **Hero Photo Carousel**, an **"At-a-Glance" Vibe & Specialty Badges Scroller**, an **Outdoor Weather & Tasting Conditions Widget**, and a dedicated **Varietals & Tasting Profile Tab** with interactive flavor sliders.

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
|  | 🖼️ HERO PHOTO CAROUSEL             |  |  | Community  Amenities  AI...     |  |
|  | (Swipeable, pagination dots)      |  |  +---------------------------------+  |
|  +-----------------------------------+  |  | CONTENT FOR ACTIVE TAB:         |  |
|                                         |  |                                 |  |
|  +-----------------------------------+  |  |  * Varietals Tab:               |  |
|  | ⚡ QUICK ACTIONS ROW               |  |  |    - Dry Riesling [Dry--o--Sweet]|  |
|  | [❤️ Favorite [🔒]] [⭐ Wishlist [🔒]]|  |  |    - Cabernet Franc              |  |
|  | [🌐 Street View] [🔗 Share]        |  |  |                                 |  |
|  | [✏️ Log Visit] (Primary CTA)       |  |  * Amenities Tab:               |  |
|  +-----------------------------------+  |  |    - Restrooms: ✅ Yes          |  |
|                                         |  |    - Tasting Room: ✅ Yes       |  |
|  +-----------------------------------+  |  |    - EV Charging: ❓ Ask-------+--|
|  | ☀️ 74°F • Sunny Lake Breeze       |  |  |                                 |  |  |
|  +-----------------------------------+  |  * Community Tab:               |  |  |
|  | 🍷 Riesling Specialist | 🐶 Dogs  |  |    - Avatars: 🧑‍🦰🧑👩 (Hover Names) |  |  |
|  +-----------------------------------+  |    - Reviews Feed (Text+Photos) |  |  |
|                                         |  +---------------------------------+  |  |
|  +-----------------------------------+  |                                       |  |
|  | 🟢 Open Now  | Contact: 📞 🌐 ✉️   |  |  +---------------------------------+  |  |
|  | 🚗 [ Route From Current ] Button  |  |  | 🔍 REVIEWS SIDE-SHEET (SLID OUT)|  |<-+
|  +-----------------------------------+  |  |                                 |
|                                         |  |  Question: EV Charging          |
|                                         |  |  "EV charging station works..." |
|                                         |  |  <  1 of 3  >        [Close]    |
|                                         |  +---------------------------------+
+---------------------------------------------------------------------------------+
```

### B. Mobile Viewport (< sm / less than `640px`) - 3-Tier Multi-Snap Drawer

#### 1. Peek Snap State (~300px / ~30% Viewport Height)
*Allows 70% of the interactive map behind the drawer to remain visible for spatial orientation.*
```
+-----------------------------------+
|  (=) Drag Handle                  |
|                                   |
|  +-----------------------------+  |
|  | 🖼️ Photo Preview            |  |
|  | 🍇 Château Luna Winery ⭐4.8 |  | <-- Translucent Title Card
|  +-----------------------------+  |
|                                   |
|  🟢 OPEN NOW                      | <-- Open/Closed Status Tag (MANDATORY)
|                                   |
|  +-----------------------------+  |
|  | [🚗 Directions] [✏️Log Visit]|  | <-- Directions & Log Visit CTA Swapped
|  +-----------------------------+  |
+-----------------------------------+
```

#### 2. Half Snap State (~550px / ~60% Viewport Height)
*Primary hub for quick decision-making, vibe evaluation, and action taking.*
```
+-----------------------------------+
|  (=) Drag Handle                  |
|                                   |
|  +-----------------------------+  |
|  | 🖼️ HERO PHOTO CAROUSEL (• o o)|  | <-- Swipeable photo carousel
|  | 🍇 Château Luna Winery ⭐4.8 |  |
|  +-----------------------------+  |
|                                   |
|  +-----------------------------+  |
|  | ❤️ Fav [🔒] ⭐ Wish [🔒] ...  |  | <-- 4-Grid Action Tiles
|  +-----------------------------+  |
|                                   |
|  ☀️ 74°F • Sunny Lake Breeze      | <-- Outdoor Weather Widget
|                                   |
|  [ ✏️ Log Visit (Primary CTA)   ] | <-- Primary Winery Theme Button
|                                   |
|  [🍷 Riesling Spec] [🐶 Dog] [⚡EV]| <-- "At-a-Glance" Vibe Scroller
|                                   |
|  🟢 Open Now | 📞 🌐 ✉️ 🚗 Directions| <-- Overview Contact Card
+-----------------------------------+
```

#### 3. Full Snap State (1.0 / ~90% Viewport Height)
*Deep-dive exploration state for tabs, varietals, community reviews, and trips.*
```
+-----------------------------------+
|  (=) Drag Handle                  |
|  🍇 Château Luna Winery       (X) | <-- Sticky Compact Header
|                                   |
|  [Community][Amenities][AI][Varietals][Trip] <-- 5 Scrollable Tabs
|  +---------------------------------+
|  | ACTIVE TAB CONTENT:             |
|  |                                 |
|  | * Varietals & Tasting Tab:      |
|  |   🍇 Dry Riesling               |
|  |   Dry [========o=======] Sweet  |
|  |   Light [========o=====] Body   |
|  |   "Aromas of white peach..."    |
|  |                                 |
|  |   🍷 Cabernet Franc             |
|  |   Dry [======o=========] Sweet  |
|  |                                 |
|  | * Amenities Tab:                |
|  |   - 🚗 Free Parking: ✅ Yes     |
|  |   - 🛁 Restrooms: ❓ Ask Reviews|
|  |   - 🍷 Tasting Room: ❓ Ask     |
|  +---------------------------------+
+-----------------------------------+
```

---

## 3. Component Details & Feature Preservation Audit

To ensure **ZERO feature loss** across all refactors, the following component matrix must be preserved:

| Component | Required Data & Functionality | Required Test IDs & Interactive Hooks |
| :--- | :--- | :--- |
| `winery-modal.tsx` | Responsive Drawer/Dialog, 3 Snap Points (`300px`, `550px`, `1.0`), Drag offset dismiss, Trip badge click handler (`handleTripBadgeClick`). | `winery-modal-drawer`, `winery-modal-dialog`, `modal-left-column`, `modal-right-column`, `trip-badge` |
| `WineryDetails.tsx` | Photo carousel, Open status indicator (`isOpenNow`), Expandable weekly hours, Contact icons (Phone, Website, Email, Directions), Gemini summary, Neighborhood summary, 8+ Logistics checklist rows, Side-Sheet/Sub-Drawer review trigger. | `hours-toggle`, `route-from-current`, `amenity-row-*`, `status-yes`, `status-no`, `status-unknown-*`, `gemini-summary` |
| `WineryActionsPresentational.tsx` | 4-grid tiles (Favorite, Wishlist, Street View, Share), privacy lock toggles as overlay badges, full-width "Log Visit" CTA button. | `favorite-button`, `wishlist-button`, `favorite-privacy-toggle`, `wishlist-privacy-toggle`, `street-view-button`, `share-button`, `log-visit-button` |
| `WineryCommunityTab.tsx` | Consolidated friend avatar summaries + detailed review cards feed (rating stars, written text, uploaded photos). | `community-tab-content`, friend avatar group, review card items |
| `TripPlannerSection.tsx` | Add/remove winery to/from trip, trip selector dropdown, create trip modal trigger. | `trip-planner-section`, trip selection triggers |
| `VisitCardHistory.tsx` | Visit history list, photo thumbnail strip, Edit Visit (`openVisitForm`), Delete Visit (`deleteVisitAction`). | `visits-tab-content`, visit history cards |
| `WineryQnA.tsx` | Paginated review snippets (`< 1 of 3 >`), question keyword search configurations, close button. | `amenity-reviews-sheet`, `amenity-reviews-drawer`, `close-qna-button` |

---

## 4. Peek Snap Directives (CRITICAL)
1. **Open/Closed Status Tag (MANDATORY)**: Peek state MUST explicitly display the Open/Closed status tag (`🟢 OPEN NOW` or `🔴 CLOSED`) adjacent to the winery name or below the photo preview.
2. **Button Swapping**: In the Peek state action bar, the `Add to Trip` button is **replaced** with the `Log Visit` CTA button (`data-testid="log-visit-button"`), positioned alongside the `Directions` button (`data-testid="route-from-current"`).

---

## 5. Visual Styling Specs (Tailwind v4)
* **Drawer Snap Points**: `snapPoints={['300px', '550px', 1]}` using Vaul / Radix UI Drawer primitives.
* **Hero Carousel**: `embla-carousel-react` or Tailwind horizontal scroll snapping with animated pagination indicators.
* **Vibe Badges Scroller**: `overflow-x-auto scrollbar-none flex gap-2 py-1` housing pill badges (`bg-primary/10 border border-primary/20 text-primary text-xs rounded-full px-3 py-1 font-medium`).
* **Varietal Cards & Flavor Sliders**: Glassmorphic cards (`bg-muted/40 border border-border/50 rounded-xl p-3`) featuring custom linear sliders for Dry ↔ Sweet and Light ↔ Full Body.

---

## 6. Acceptance Criteria
* [ ] Mobile modal supports 3 dynamic snap points: `Peek (~300px)`, `Half (~550px)`, and `Full (1.0)`.
* [ ] Peek snap state displays the `🟢 OPEN NOW` / `🔴 CLOSED` status tag.
* [ ] Peek snap state action bar contains `Directions` and `Log Visit` (swapped from `Add to Trip`).
* [ ] Hero header renders an interactive photo carousel with pagination dots.
* [ ] Half snap state renders 4-column quick action tiles with privacy lock badges.
* [ ] Half snap state renders live weather widget and horizontal "At-a-Glance" vibe scroller.
* [ ] Full snap state renders 5 scrollable tabs including `Varietals & Tasting`.
* [ ] `Varietals & Tasting` tab renders visual varietal cards with Dry/Sweet and Light/Body flavor profile sliders.
* [ ] All existing test IDs (`favorite-privacy-toggle`, `wishlist-privacy-toggle`, `log-visit-button`, `route-from-current`, `amenity-row-*`, `close-qna-button`) remain 100% functional.
* [ ] All unit and Playwright E2E tests pass cleanly.
* [ ] Loading skeleton matches the column-split structure of the ready modal (including hero image overlay and 4-column grid skeletons).
