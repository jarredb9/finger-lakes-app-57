-- Add updated_at trigger to visits table
-- Migration: 20260402000002_add_updated_at_to_visits.sql

DROP TRIGGER IF EXISTS tr_visits_updated_at ON public.visits;
CREATE TRIGGER tr_visits_updated_at
    BEFORE UPDATE ON public.visits
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();
