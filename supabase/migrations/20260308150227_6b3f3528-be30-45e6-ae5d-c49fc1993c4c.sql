ALTER TABLE public.profiles ADD COLUMN employee_id text;

-- Allow super_admin to update any profile
CREATE POLICY "Super admin can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Allow People & Culture dept managers to update profiles
CREATE POLICY "PC managers can update profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM department_members dm
    JOIN departments d ON d.id = dm.department_id
    WHERE dm.user_id = auth.uid() AND dm.is_manager = true AND d.code = 'PC'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM department_members dm
    JOIN departments d ON d.id = dm.department_id
    WHERE dm.user_id = auth.uid() AND dm.is_manager = true AND d.code = 'PC'
  )
);