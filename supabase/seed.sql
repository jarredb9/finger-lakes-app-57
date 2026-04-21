-- Seed Test Users
-- These users are required for local development and E2E testing

-- 1. Create Users in Auth schema (if they don't exist)
-- Note: Local Supabase allows manual insertion into auth.users for seeding purposes, 
-- but it's cleaner to use a DO block to prevent collisions.

DO $$
DECLARE
    jarred_id UUID := '617ea073-ef93-4a8c-a9c3-e0ab38ed0d28';
    tester_id UUID := 'c2ad5f0b-bf0a-4917-98d3-f9262ed1b409';
BEGIN
    -- Jarred
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = jarred_id) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, recovery_sent_at, last_sign_in_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, 
            updated_at, confirmation_token, email_change, 
            email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', jarred_id, 'authenticated', 'authenticated', 
            'jarred@mail.com', crypt('password', gen_salt('bf')), 
            now(), now(), now(), 
            '{"provider":"email","providers":["email"]}', '{"name":"Jarred"}', 
            now(), now(), '', '', '', ''
        );
        
        -- Identity
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
            jarred_id, jarred_id, format('{"sub":"%s","email":"jarred@mail.com"}', jarred_id)::jsonb, 'email', now(), now(), now()
        );
    END IF;

    -- Tester
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = tester_id) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, recovery_sent_at, last_sign_in_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, 
            updated_at, confirmation_token, email_change, 
            email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', tester_id, 'authenticated', 'authenticated', 
            'tester@mail.com', crypt('password', gen_salt('bf')), 
            now(), now(), now(), 
            '{"provider":"email","providers":["email"]}', '{"name":"Tester"}', 
            now(), now(), '', '', '', ''
        );

        -- Identity
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
            tester_id, tester_id, format('{"sub":"%s","email":"tester@mail.com"}', tester_id)::jsonb, 'email', now(), now(), now()
        );
    END IF;

    -- 2. Create Profiles in Public schema (id matches auth.users)
    -- Profiles are usually handled by a trigger, but we upsert for safety in seed.
    INSERT INTO public.profiles (id, email, name, privacy_level)
    VALUES 
        (jarred_id, 'jarred@mail.com', 'Jarred', 'public'),
        (tester_id, 'tester@mail.com', 'Tester', 'public')
    ON CONFLICT (id) DO UPDATE 
    SET email = EXCLUDED.email, name = EXCLUDED.name;

END $$;
