-- Fix handle_activity_ledger_entry trigger to only access rating field on visits table

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
                ELSE jsonb_build_object(
                        'winery_id', v_winery_id,
                        'winery_name', v_winery_name
                    )
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
