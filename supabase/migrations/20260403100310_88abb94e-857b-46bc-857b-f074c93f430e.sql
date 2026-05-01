
-- Drop the overly permissive insert policy
DROP POLICY "System can insert endorsements" ON public.leave_endorsements;

-- Fix search_path on functions
CREATE OR REPLACE FUNCTION public.update_endorsement_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
