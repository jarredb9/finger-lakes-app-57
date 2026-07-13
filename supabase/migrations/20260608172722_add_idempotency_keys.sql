-- Add idempotency_key UUID UNIQUE columns to public.visits and public.trips tables
ALTER TABLE public.visits ADD COLUMN idempotency_key UUID UNIQUE;
ALTER TABLE public.trips ADD COLUMN idempotency_key UUID UNIQUE;
