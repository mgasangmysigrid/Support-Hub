
DROP POLICY "Users can read own roles" ON public.user_roles;

CREATE POLICY "Users can read roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.department_members dm
    WHERE dm.user_id = auth.uid() AND dm.is_manager = true
  )
);
