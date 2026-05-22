DROP TRIGGER IF EXISTS tr_visits_updated_at ON public.visits;
CREATE TRIGGER tr_visits_updated_at
    BEFORE UPDATE ON public.visits
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();
