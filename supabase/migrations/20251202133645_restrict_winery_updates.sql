-- Drop the permissive update policy for wineries
DROP POLICY "Authenticated users can update wineries" ON public.wineries;