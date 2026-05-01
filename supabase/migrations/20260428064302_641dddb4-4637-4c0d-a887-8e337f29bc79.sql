-- Allow super_admin and People & Culture to create endorsements on behalf of any employee
-- (existing employee self-insert policy remains untouched)
CREATE POLICY "Admins can insert endorsements"
ON public.leave_endorsements
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_pc_member(auth.uid())
);