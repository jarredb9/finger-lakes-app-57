-- scripts/db/fixtures/adversarial-seed.sql
-- Adversarial dirty seed for verifying two-phase migration replay against pre-existing rows.
-- Executed at migration anchor 20261026000000 (immediately prior to 20261104100000_harden_friends_and_profiles.sql).

DO $$
DECLARE
    -- Deterministic UUIDs for adversarial verification users
    user_a_id UUID := '00000000-0000-4000-8000-000000000001';
    user_b_id UUID := '00000000-0000-4000-8000-000000000002';
    user_c_id UUID := '00000000-0000-4000-8000-000000000003';
    user_d_id UUID := '00000000-0000-4000-8000-000000000004';
    usr RECORD;
BEGIN
    PERFORM set_config('search_path', 'public, auth, extensions', true);

    -- 1. Create Test Users in auth.users & auth.identities
    -- Trigger on_auth_user_created automatically populates public.profiles(id, name, email)
    FOR usr IN
        SELECT * FROM (VALUES
            (user_a_id, 'adversarial_a@example.com', 'Adversarial User A'),
            (user_b_id, 'adversarial_b@example.com', 'Adversarial User B'),
            (user_c_id, 'ConflictUser@Example.com', 'Conflict User C'),
            (user_d_id, 'conflictuser@example.com', 'Conflict User D')
        ) AS t(id, email, name)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = usr.id) THEN
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, recovery_sent_at, last_sign_in_at,
                raw_app_meta_data, raw_user_meta_data, created_at,
                updated_at, confirmation_token, email_change,
                email_change_token_new, recovery_token
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', usr.id, 'authenticated', 'authenticated',
                usr.email, crypt('password123', gen_salt('bf')),
                now(), now(), now(),
                '{"provider":"email","providers":["email"]}', format('{"name":"%s"}', usr.name)::jsonb,
                now(), now(), '', '', '', ''
            );
            INSERT INTO auth.identities (
                id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
            ) VALUES (
                usr.id, usr.id, format('{"sub":"%s","email":"%s"}', usr.id, usr.email)::jsonb, 'email', usr.id, now(), now(), now()
            );
        END IF;
    END LOOP;

    -- Ensure public.profiles reflects exact casing
    UPDATE public.profiles SET email = 'ConflictUser@Example.com' WHERE id = user_c_id;
    UPDATE public.profiles SET email = 'conflictuser@example.com' WHERE id = user_d_id;

    -- 2. Seed Adversarial Friends Rows
    -- Condition 1: Self-referential friendship row (user1_id = user2_id)
    -- Must be scrubbed by migration 20261104100000 prior to adding friends_user1_ne_user2
    INSERT INTO public.friends (user1_id, user2_id, status, created_at, updated_at)
    VALUES (user_a_id, user_a_id, 'pending', now() - INTERVAL '2 days', now() - INTERVAL '2 days');

    -- Condition 2: Reciprocal / bidirectional duplicate friendship pair
    -- Must be deduplicated by migration 20261104100000 prior to creating idx_friends_unique_pair
    -- Deterministic priority rule: 'accepted' (priority 1) must be kept, 'pending' (priority 2) must be deleted.
    -- Invert timestamps: 'pending' receives newer now(), 'accepted' receives older (now() - 1 day)
    -- to prove that status priority takes precedence over recency.
    INSERT INTO public.friends (user1_id, user2_id, status, created_at, updated_at)
    VALUES (user_a_id, user_b_id, 'pending', now(), now());

    INSERT INTO public.friends (user1_id, user2_id, status, created_at, updated_at)
    VALUES (user_b_id, user_a_id, 'accepted', now() - INTERVAL '1 day', now() - INTERVAL '1 day');

END $$;
