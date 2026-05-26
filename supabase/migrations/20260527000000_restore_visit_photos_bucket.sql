INSERT INTO storage.buckets (id, name, public) 
VALUES ('visit-photos', 'visit-photos', true)
ON CONFLICT (id) DO NOTHING;
