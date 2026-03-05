-- Backfill trip_members from trips
DO $$
BEGIN
    -- 1. Insert the owner of each trip as a member with 'owner' role
    INSERT INTO public.trip_members (trip_id, user_id, role, status)
    SELECT id, user_id, 'owner', 'joined'
    FROM public.trips
    ON CONFLICT (trip_id, user_id) DO UPDATE SET role = 'owner';

    -- 2. Insert members from the trips.members array as members with 'member' role
    -- Only for those where the user exists in profiles (referential integrity)
    INSERT INTO public.trip_members (trip_id, user_id, role, status)
    SELECT t.id, m.member_id, 'member', 'joined'
    FROM public.trips t,
    LATERAL unnest(t.members) AS m(member_id)
    JOIN public.profiles p ON p.id = m.member_id
    ON CONFLICT (trip_id, user_id) DO NOTHING;
END $$;
