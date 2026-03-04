# Specification: Track 4 - Social Visit Tagging & Shared History

## Objective
Implement a "Tag Friends" feature when logging a visit, creating a shared history and notifying friends of the visit.

## Dependencies
- **Track 1:** Must have `visit_participants` table and related RPCs (`log_visit_with_friends`).

## Scope
- **Tag UI:** A search-and-select component in the `VisitForm` to tag friends.
- **Shared History:** A dedicated section in the user profile showing visits they were tagged in by friends.
- **Privacy Controls:** User settings to "Always Allow," "Review Tag," or "Block Tagging."
- **Notifications:** Informing users when they've been tagged in a new visit.

## Success Criteria
1. Users can tag friends when logging a new visit.
2. Tagged visits appear in the history lists of both the tagger and tagged users.
3. Users can remove themselves from a visit they were tagged in.
