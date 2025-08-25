-- This script creates the necessary 'profiles' table, sets up the 'friends' table correctly,
-- and updates existing tables to reference 'profiles' instead of 'auth.users'.

-- Step 1: Create a public profiles table to store user data
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT UNIQUE
);

-- Step 2: Enable RLS for the new profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policies for the profiles table
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile." ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile." ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Step 4: Create a function to automatically insert a new profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email)
    VALUES (new.id, new.raw_user_meta_data->>'name', new.email);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create a trigger to call the function on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Step 6: Backfill profiles table for existing users to ensure they have a profile
INSERT INTO public.profiles (id, name, email)
SELECT id, raw_user_meta_data->>'name', email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Step 7: Drop existing friends table if it exists to recreate it correctly
DROP TABLE IF EXISTS public.friends;

-- Step 8: Create the friends table, referencing the new public.profiles table
CREATE TABLE public.friends (
    id SERIAL PRIMARY KEY,
    user1_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    user2_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user1_id, user2_id)
);

-- Step 9: Enable RLS on the friends table
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Step 10: RLS Policies for friends table
CREATE POLICY "Users can view their own friendships" ON public.friends
    FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "Users can create friend requests" ON public.friends
    FOR INSERT WITH CHECK (auth.uid() = user1_id);
CREATE POLICY "Users can respond to friend requests" ON public.friends
    FOR UPDATE USING (auth.uid() = user2_id) WITH CHECK (status IN ('accepted', 'declined'));
CREATE POLICY "Users can delete their own friendships" ON public.friends
    FOR DELETE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Step 11: Correct Foreign Key on 'visits' table
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS "visits_user_id_fkey";
ALTER TABLE public.visits
ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Step 12: Correct Foreign Key on 'trips' table
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS "trips_user_id_fkey";
ALTER TABLE public.trips
ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Step 13: Add members column to trips table if it doesn't exist
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS members UUID[];

-- Step 14: Update RLS policies for trips to allow members to view and edit
DROP POLICY IF EXISTS "Users can view their own trips" ON public.trips;
CREATE POLICY "Users can view their own trips" ON public.trips
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = ANY(members));

DROP POLICY IF EXISTS "Users can update their own trips" ON public.trips;
CREATE POLICY "Users can update their own trips" ON public.trips
    FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = ANY(members));