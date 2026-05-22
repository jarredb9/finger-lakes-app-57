-- Add updated_at to trips and trip_wineries
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.trip_wineries ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
DROP TRIGGER IF EXISTS tr_trips_updated_at ON public.trips;
CREATE TRIGGER tr_trips_updated_at
    BEFORE UPDATE ON public.trips
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_trip_wineries_updated_at ON public.trip_wineries;
CREATE TRIGGER tr_trip_wineries_updated_at
    BEFORE UPDATE ON public.trip_wineries
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();
