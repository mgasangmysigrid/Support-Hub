
-- Allow managers to manage department_members (add, update, remove)
CREATE POLICY "Managers can manage dept members"
ON public.department_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.department_members dm
    WHERE dm.user_id = auth.uid() AND dm.is_manager = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.department_members dm
    WHERE dm.user_id = auth.uid() AND dm.is_manager = true
  )
);

-- Allow managers to manage user_roles (but not super_admin roles)
CREATE POLICY "Managers can manage non-owner roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.department_members dm
    WHERE dm.user_id = auth.uid() AND dm.is_manager = true
  )
  AND role != 'super_admin'
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.department_members dm
    WHERE dm.user_id = auth.uid() AND dm.is_manager = true
  )
  AND role != 'super_admin'
);
