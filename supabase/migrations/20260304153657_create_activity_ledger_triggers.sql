-- Create triggers to populate activity_ledger from visits, favorites, and wishlist

-- 1. Trigger function to handle ledger entries
CREATE OR REPLACE FUNCTION public.handle_activity_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_winery_name text;
    v_winery_id integer;
    v_privacy_level text;
    v_user_privacy text;
BEGIN
    -- Determine privacy level
    -- We map BOOLEAN is_private to TEXT privacy_level for the ledger
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Get user's default privacy level as a fallback
        SELECT privacy_level::text INTO v_user_privacy FROM public.profiles WHERE id = NEW.user_id;
        
        IF NEW.is_private THEN
            v_privacy_level := 'private';
        ELSIF v_user_privacy = 'friends_only' THEN
            v_privacy_level := 'friends_only';
        ELSE
            v_privacy_level := 'public';
        END IF;

        -- Get winery details for metadata
        SELECT id, name INTO v_winery_id, v_winery_name FROM public.wineries WHERE id = NEW.winery_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'visits' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'visit', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name,
                    'rating', NEW.rating,
                    'user_review', NEW.user_review,
                    'photos', COALESCE(to_jsonb(NEW.photos), '[]'::jsonb)
                ),
                NEW.created_at
            );
        ELSIF TG_TABLE_NAME = 'favorites' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'favorite', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name
                ),
                NEW.created_at
            );
        ELSIF TG_TABLE_NAME = 'wishlist' THEN
            INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
            VALUES (
                NEW.user_id, 
                'wishlist', 
                NEW.id::text, 
                v_privacy_level, 
                jsonb_build_object(
                    'winery_id', v_winery_id,
                    'winery_name', v_winery_name
                ),
                NEW.created_at
            );
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Update existing ledger entry
        UPDATE public.activity_ledger
        SET 
            privacy_level = v_privacy_level,
            metadata = CASE 
                WHEN TG_TABLE_NAME = 'visits' THEN 
                    jsonb_build_object(
                        'winery_id', v_winery_id,
                        'winery_name', v_winery_name,
                        'rating', NEW.rating,
                        'user_review', NEW.user_review,
                        'photos', COALESCE(to_jsonb(NEW.photos), '[]'::jsonb)
                    )
                ELSE metadata -- For favorites/wishlist, winery info rarely changes
            END
        WHERE activity_type = CASE 
                WHEN TG_TABLE_NAME = 'visits' THEN 'visit'
                WHEN TG_TABLE_NAME = 'favorites' THEN 'favorite'
                WHEN TG_TABLE_NAME = 'wishlist' THEN 'wishlist'
            END
          AND object_id = OLD.id::text;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        -- Remove ledger entry
        DELETE FROM public.activity_ledger
        WHERE activity_type = CASE 
                WHEN TG_TABLE_NAME = 'visits' THEN 'visit'
                WHEN TG_TABLE_NAME = 'favorites' THEN 'favorite'
                WHEN TG_TABLE_NAME = 'wishlist' THEN 'wishlist'
            END
          AND object_id = OLD.id::text;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- 2. Create Triggers
DROP TRIGGER IF EXISTS tr_visits_activity_ledger ON public.visits;
CREATE TRIGGER tr_visits_activity_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.handle_activity_ledger_entry();

DROP TRIGGER IF EXISTS tr_favorites_activity_ledger ON public.favorites;
CREATE TRIGGER tr_favorites_activity_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.favorites
FOR EACH ROW EXECUTE FUNCTION public.handle_activity_ledger_entry();

DROP TRIGGER IF EXISTS tr_wishlist_activity_ledger ON public.wishlist;
CREATE TRIGGER tr_wishlist_activity_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.wishlist
FOR EACH ROW EXECUTE FUNCTION public.handle_activity_ledger_entry();

-- 3. Backfill existing data into activity_ledger
-- Visits
INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
SELECT 
    v.user_id,
    'visit',
    v.id::text,
    CASE 
        WHEN v.is_private THEN 'private'
        WHEN p.privacy_level = 'friends_only' THEN 'friends_only'
        ELSE 'public'
    END,
    jsonb_build_object(
        'winery_id', w.id,
        'winery_name', w.name,
        'rating', v.rating,
        'user_review', v.user_review,
        'photos', COALESCE(to_jsonb(v.photos), '[]'::jsonb)
    ),
    v.created_at
FROM public.visits v
JOIN public.wineries w ON v.winery_id = w.id
JOIN public.profiles p ON v.user_id = p.id
ON CONFLICT DO NOTHING;

-- Favorites
INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
SELECT 
    f.user_id,
    'favorite',
    f.id::text,
    CASE 
        WHEN f.is_private THEN 'private'
        WHEN p.privacy_level = 'friends_only' THEN 'friends_only'
        ELSE 'public'
    END,
    jsonb_build_object(
        'winery_id', w.id,
        'winery_name', w.name
    ),
    f.created_at
FROM public.favorites f
JOIN public.wineries w ON f.winery_id = w.id
JOIN public.profiles p ON f.user_id = p.id
ON CONFLICT DO NOTHING;

-- Wishlist
INSERT INTO public.activity_ledger (user_id, activity_type, object_id, privacy_level, metadata, created_at)
SELECT 
    wl.user_id,
    'wishlist',
    wl.id::text,
    CASE 
        WHEN wl.is_private THEN 'private'
        WHEN p.privacy_level = 'friends_only' THEN 'friends_only'
        ELSE 'public'
    END,
    jsonb_build_object(
        'winery_id', w.id,
        'winery_name', w.name
    ),
    wl.created_at
FROM public.wishlist wl
JOIN public.wineries w ON wl.winery_id = w.id
JOIN public.profiles p ON wl.user_id = p.id
ON CONFLICT DO NOTHING;
