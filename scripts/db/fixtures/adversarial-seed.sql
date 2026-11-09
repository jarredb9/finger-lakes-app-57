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
BEGIN
    PERFORM set_config('search_path', 'public, auth, extensions', true);

    -- 1. Create Test Users in auth.users & auth.identities
    -- Trigger on_auth_user_created automatically populates public.profiles(id, name, email)

    -- User A (for self-referential & reciprocal pair)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_a_id) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at,
            updated_at, confirmation_token, email_change,
            email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', user_a_id, 'authenticated', 'authenticated',
            'adversarial_a@example.com', crypt('password123', gen_salt('bf')),
            now(), now(), now(),
            '{"provider":"email","providers":["email"]}', '{"name":"Adversarial User A"}',
            now(), now(), '', '', '', ''
        );
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            user_a_id, user_a_id, format('{"sub":"%s","email":"adversarial_a@example.com"}', user_a_id)::jsonb, 'email', user_a_id, now(), now(), now()
        );
    END IF;

    -- User B (for reciprocal pair)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_b_id) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at,
            updated_at, confirmation_token, email_change,
            email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', user_b_id, 'authenticated', 'authenticated',
            'adversarial_b@example.com', crypt('password123', gen_salt('bf')),
            now(), now(), now(),
            '{"provider":"email","providers":["email"]}', '{"name":"Adversarial User B"}',
            now(), now(), '', '', '', ''
        );
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            user_b_id, user_b_id, format('{"sub":"%s","email":"adversarial_b@example.com"}', user_b_id)::jsonb, 'email', user_b_id, now(), now(), now()
        );
    END IF;

    -- User C (Mixed-case duplicate email - primary lower UUID)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_c_id) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at,
            updated_at, confirmation_token, email_change,
            email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', user_c_id, 'authenticated', 'authenticated',
            'ConflictUser@Example.com', crypt('password123', gen_salt('bf')),
            now(), now(), now(),
            '{"provider":"email","providers":["email"]}', '{"name":"Conflict User C"}',
            now(), now(), '', '', '', ''
        );
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            user_c_id, user_c_id, format('{"sub":"%s","email":"ConflictUser@Example.com"}', user_c_id)::jsonb, 'email', user_c_id, now(), now(), now()
        );
    END IF;

    -- User D (Mixed-case duplicate email - secondary higher UUID)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_d_id) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at,
            updated_at, confirmation_token, email_change,
            email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', user_d_id, 'authenticated', 'authenticated',
            'conflictuser@example.com', crypt('password123', gen_salt('bf')),
            now(), now(), now(),
            '{"provider":"email","providers":["email"]}', '{"name":"Conflict User D"}',
            now(), now(), '', '', '', ''
        );
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            user_d_id, user_d_id, format('{"sub":"%s","email":"conflictuser@example.com"}', user_d_id)::jsonb, 'email', user_d_id, now(), now(), now()
        );
    END IF;

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
    -- Deterministic priority rule: 'accepted' (priority 1) must be kept, 'pending' (priority 2) must be deleted
    INSERT INTO public.friends (user1_id, user2_id, status, created_at, updated_at)
    VALUES (user_a_id, user_b_id, 'pending', now() - INTERVAL '1 day', now() - INTERVAL '1 day');

    INSERT INTO public.friends (user1_id, user2_id, status, created_at, updated_at)
    VALUES (user_b_id, user_a_id, 'accepted', now(), now());

END $$;
