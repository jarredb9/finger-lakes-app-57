---
title: Backend Security & RPC Context
impact: CRITICAL
impactDescription: Prevents auth-level failures and "Function Not Found" errors
tags: supabase, rpc, security, search-path
---

## Backend Security & RPC Context

All Supabase RPCs MUST be documented with their security context. Failure to account for the `search_path` or RLS tier causes tests to fail in the "Auth" phase.

### 1. The Search Path & Prefix Rule
Document every RPC involved and ensure it sets the correct path and uses explicit prefixes.
- **Rule:** All Postgres functions MUST set `SET search_path = public, auth`.
- **Prefix Rule:** ALWAYS use `public.` prefix when calling helper functions (e.g., `public.is_trip_member(id)`) within RPCs or RLS policies to prevent schema hijacking.
- **Handoff Requirement:** Document the `SECURITY DEFINER` status for any new RPC.

### 2. The Visibility Rule
Document the privacy tiers used by the feature.
- **Tiers:** Public, Friends Only, Private.
- **Handoff Requirement:** Identify the specific `is_visible_to_viewer` RPC call or RLS policy that governs the data.

**Example Brief Section:**
> **Backend Context:**
> - **RPC:** `get_friend_activity_feed` (Sets `search_path = public, auth`).
> - **Security:** `SECURITY DEFINER` (Uses `auth.uid()` for requester identification).
> - **Privacy:** Governed by the `activity_ledger` RLS policy.

Reference: [Supabase Security Best Practices](https://supabase.com/docs/guides/database/postgres/security)
