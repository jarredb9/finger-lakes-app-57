-- Migration: P0 Security Hotfixes - RLS & Security Definer Hardening
-- Date: 2026-09-02
-- Description:
-- 1. Drop permissive RLS UPDATE on public.wineries and revoke UPDATE from anon and authenticated.
-- 2. Revoke execute privileges on bulk_upsert_wineries(jsonb[]) from PUBLIC and grant strictly to service_role.
-- 3. Set explicit search_path on handle_activity_ledger_notification trigger function.

-- 1. Restrict winery updates strictly to service_role and security definers
DROP POLICY IF EXISTS "Authenticated users can update wineries" ON public.wineries;
REVOKE UPDATE ON TABLE public.wineries FROM anon, authenticated;

-- 2. Revoke execute privileges on bulk_upsert_wineries(jsonb[]) from PUBLIC and grant to service_role
REVOKE ALL ON FUNCTION public.bulk_upsert_wineries(jsonb[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_upsert_wineries(jsonb[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_wineries(jsonb[]) TO service_role;

-- 3. Set explicit search_path on handle_activity_ledger_notification trigger function
ALTER FUNCTION public.handle_activity_ledger_notification() SET search_path = public, vault, extensions, pg_temp;
