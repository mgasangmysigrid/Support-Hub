
-- Allow employees to delete their own draft endorsements
CREATE POLICY "Employee can delete own draft endorsements"
ON public.leave_endorsements
FOR DELETE
TO authenticated
USING (
  (employee_user_id = auth.uid() AND status = 'draft'::endorsement_status)
  OR is_super_admin(auth.uid())
  OR is_pc_member(auth.uid())
);

-- Add cascade delete on leave_endorsement_items
ALTER TABLE public.leave_endorsement_items
DROP CONSTRAINT leave_endorsement_items_endorsement_id_fkey,
ADD CONSTRAINT leave_endorsement_items_endorsement_id_fkey
  FOREIGN KEY (endorsement_id) REFERENCES public.leave_endorsements(id) ON DELETE CASCADE;

-- Add cascade delete on leave_endorsement_references
ALTER TABLE public.leave_endorsement_references
DROP CONSTRAINT leave_endorsement_references_endorsement_id_fkey,
ADD CONSTRAINT leave_endorsement_references_endorsement_id_fkey
  FOREIGN KEY (endorsement_id) REFERENCES public.leave_endorsements(id) ON DELETE CASCADE;
