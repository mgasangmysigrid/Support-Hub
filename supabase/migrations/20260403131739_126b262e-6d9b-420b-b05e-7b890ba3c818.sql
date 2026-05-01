
-- Add RLS policy for item assignees to view endorsements
CREATE POLICY "Item assignees can view endorsements"
ON public.leave_endorsements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.endorsement_item_assignees eia
    JOIN public.leave_endorsement_items lei ON lei.id = eia.endorsement_item_id
    WHERE lei.endorsement_id = leave_endorsements.id
    AND eia.user_id = auth.uid()
  )
);

-- Add RLS policy for item assignees to view endorsement items
DROP POLICY IF EXISTS "Users can view endorsement items" ON public.leave_endorsement_items;
CREATE POLICY "Users can view endorsement items"
ON public.leave_endorsement_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = leave_endorsement_items.endorsement_id
    AND (
      e.employee_user_id = auth.uid()
      OR e.primary_recipient_user_id = auth.uid()
      OR e.secondary_recipient_user_id = auth.uid()
      OR e.manager_user_id = auth.uid()
      OR is_super_admin(auth.uid())
      OR is_pc_member(auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.endorsement_item_assignees eia
    WHERE eia.endorsement_item_id = leave_endorsement_items.id
    AND eia.user_id = auth.uid()
  )
);

-- Update endorsement references SELECT to include item assignees
DROP POLICY IF EXISTS "Users can view endorsement references" ON public.leave_endorsement_references;
CREATE POLICY "Users can view endorsement references"
ON public.leave_endorsement_references
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = leave_endorsement_references.endorsement_id
    AND (
      e.employee_user_id = auth.uid()
      OR e.primary_recipient_user_id = auth.uid()
      OR e.secondary_recipient_user_id = auth.uid()
      OR e.manager_user_id = auth.uid()
      OR is_super_admin(auth.uid())
      OR is_pc_member(auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.endorsement_item_assignees eia
    JOIN public.leave_endorsement_items lei ON lei.id = eia.endorsement_item_id
    WHERE lei.endorsement_id = leave_endorsement_references.endorsement_id
    AND eia.user_id = auth.uid()
  )
);

-- Update audit log SELECT to include item assignees
DROP POLICY IF EXISTS "Users can view endorsement audit log" ON public.endorsement_audit_log;
CREATE POLICY "Users can view endorsement audit log"
ON public.endorsement_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_audit_log.endorsement_id
    AND (
      e.employee_user_id = auth.uid()
      OR e.primary_recipient_user_id = auth.uid()
      OR e.secondary_recipient_user_id = auth.uid()
      OR e.manager_user_id = auth.uid()
      OR is_super_admin(auth.uid())
      OR is_pc_member(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.department_members dm_mgr
        JOIN public.department_members dm_emp ON dm_emp.department_id = dm_mgr.department_id
        WHERE dm_mgr.user_id = auth.uid() AND dm_mgr.is_manager = true AND dm_emp.user_id = e.employee_user_id
      )
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.endorsement_item_assignees eia
    JOIN public.leave_endorsement_items lei ON lei.id = eia.endorsement_item_id
    WHERE lei.endorsement_id = endorsement_audit_log.endorsement_id
    AND eia.user_id = auth.uid()
  )
);

-- Allow item assignees to update endorsement for acknowledgement
DROP POLICY IF EXISTS "Recipient can update for acknowledgement" ON public.leave_endorsements;
CREATE POLICY "Recipient can update for acknowledgement"
ON public.leave_endorsements
FOR UPDATE
TO authenticated
USING (
  status = 'pending_acknowledgement'
  AND (
    primary_recipient_user_id = auth.uid()
    OR secondary_recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.endorsement_item_assignees eia
      JOIN public.leave_endorsement_items lei ON lei.id = eia.endorsement_item_id
      WHERE lei.endorsement_id = leave_endorsements.id
      AND eia.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  primary_recipient_user_id = auth.uid()
  OR secondary_recipient_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.endorsement_item_assignees eia
    JOIN public.leave_endorsement_items lei ON lei.id = eia.endorsement_item_id
    WHERE lei.endorsement_id = leave_endorsements.id
    AND eia.user_id = auth.uid()
  )
);
