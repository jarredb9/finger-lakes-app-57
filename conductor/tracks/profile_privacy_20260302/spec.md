# Specification: Modify Friend Profile Privacy

## Overview
This track introduces granular privacy controls for user profiles, allowing users to manage who can see their basic information, visit history, favorites, and wishlist. This enhances user control over their social footprint within the app.

## Functional Requirements
- **Privacy Levels:**
    - **Public:** Profile data is visible to all authenticated users.
    - **Friends Only:** Profile data is visible only to users in the "Friends" list.
    - **Private:** Profile data is visible only to the owner.
- **Controlled Data Points:**
    - Basic Information (Name, Bio, Avatar)
    - Visit History
    - Favorites List
    - Wishlist ("Want to Go")
- **Default State:** All profiles (new and existing) will default to **Public** to maintain current behavior unless changed.
- **Management UI:** A new "Privacy Settings" section will be added to the user settings/profile management area.
- **Backend Enforcement:** Update Supabase Row Level Security (RLS) policies and social RPCs to respect these settings.

## Non-Functional Requirements
- **Performance:** Privacy checks should be optimized within SQL queries to maintain fast response times for social feeds and profile views.
- **Security:** RLS must be the primary enforcement mechanism to ensure data cannot be accessed via direct API calls if privacy settings prohibit it.

## Acceptance Criteria
- [ ] Users can change their profile privacy level between Public, Friends Only, and Private.
- [ ] Privacy settings are persisted in the database.
- [ ] Non-friends see a "Private Profile" or restricted view when accessing a "Friends Only" or "Private" profile.
- [ ] "Friends Only" profiles are fully visible to confirmed friends.
- [ ] Social activity feeds (e.g., friend visits) do not show items from users with "Private" settings to others.

## Out of Scope
- Per-field privacy (e.g., hiding only the bio while keeping the wishlist public).
- Time-based privacy visibility.
- Blocking specific users (this is a separate "Block" feature).
