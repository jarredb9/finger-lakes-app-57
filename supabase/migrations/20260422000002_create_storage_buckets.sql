-- Create visit-photos storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('visit-photos', 'visit-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Note: Policies for this bucket are already defined in earlier migrations 
-- (e.g., 20251126164543_remote_schema.sql), but we should ensure they exist 
-- if this is a fresh local stack.
