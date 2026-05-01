
-- Create a SECURITY DEFINER function to check if user is a manager (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_any_dept_manager(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_members
    WHERE user_id = _user_id AND is_manager = true
  )
$$;

-- Drop the problematic policy
DROP POLICY "Managers can manage dept members" ON public.department_members;

-- Recreate it using the SECURITY DEFINER function (no recursion)
CREATE POLICY "Managers can manage dept members"
  ON public.department_members
  FOR ALL
  USING (public.is_any_dept_manager(auth.uid()))
  WITH CHECK (public.is_any_dept_manager(auth.uid()));
