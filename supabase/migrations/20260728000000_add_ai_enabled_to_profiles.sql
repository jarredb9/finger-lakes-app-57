-- Migration to add ai_enabled column to user profiles (default OFF / false)
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "ai_enabled" boolean DEFAULT false NOT NULL;
