# Specification: Track social-visit-tagging - Social Visit Tagging & Shared History

## Objective
Implement a "Tag Friends" feature when logging a visit, creating a shared history and notifying friends of the visit. This leverages the `visit_participants` table implemented in Track 1.

## Dependencies
- **Track 1:** Must have `visit_participants` table and related RLS policies.
- **Track 1:** Must have `is_visible_to_viewer` RPC for privacy filtering.

## Scope

### 1. Tagging Backend
- **log_visit_with_friends RPC:** A new PostgreSQL function (or an update to `log_visit`) that atomically:
  - Upserts the winery.
  - Inserts the visit record.
  - Inserts tagging records into the `visit_participants` table for each tagged friend.
- **Participant Confirmation:** Logic to allow tagged friends to confirm or decline a visit tag.

### 2. Tagging UI
- **FriendPicker:** A search-and-select component using Radix UI `Popover` and `Command` to select friends from the user's friend list.
- **VisitForm Integration:** Update the `VisitForm` (used for both logging and editing) to include the `FriendPicker`.
- **Participant Display:** Visual indicators in visit cards showing who was tagged in the visit (avatars).

### 3. Shared History & Privacy
- **Shared Visit History:** Update profile pages and history views to show visits where the user was tagged by others.
- **Privacy Controls:** User settings to "Always Allow," "Review Tag," or "Block Tagging" for new visit invitations.
- **Mutual Privacy:** Ensure tags on private visits are only visible to the tagger and the tagged friend.

## Success Criteria
1. Users can successfully tag one or more friends when logging a winery visit.
2. Tagged visits appear in the history lists of both the tagger and all confirmed tagged users.
3. Users receive a notification (or badge) when they are tagged in a new visit.
4. Users can successfully remove themselves from a visit they were tagged in (declining the tag).
