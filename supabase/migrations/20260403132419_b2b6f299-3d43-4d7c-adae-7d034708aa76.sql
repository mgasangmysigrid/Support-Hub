
-- Allow employee to update own pending_acknowledgement endorsements (for edit/cancel)
DROP POLICY IF EXISTS "Employee can update own draft endorsements" ON public.leave_endorsements;
CREATE POLICY "Employee can update own endorsements"
ON public.leave_endorsements
FOR UPDATE
TO authenticated
USING (
  employee_user_id = auth.uid()
  AND status IN ('draft', 'pending_submission', 'pending_acknowledgement')
)
WITH CHECK (employee_user_id = auth.uid());

-- Allow employee to update items on pending_acknowledgement endorsements
DROP POLICY IF EXISTS "Employee can update endorsement items" ON public.leave_endorsement_items;
CREATE POLICY "Employee can update endorsement items"
ON public.leave_endorsement_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = leave_endorsement_items.endorsement_id
    AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission', 'pending_acknowledgement')
  )
);

-- Allow employee to insert items on pending_acknowledgement endorsements
DROP POLICY IF EXISTS "Employee can manage endorsement items" ON public.leave_endorsement_items;
CREATE POLICY "Employee can manage endorsement items"
ON public.leave_endorsement_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = leave_endorsement_items.endorsement_id
    AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission', 'pending_acknowledgement')
  )
);

-- Allow employee to delete items on pending_acknowledgement endorsements
DROP POLICY IF EXISTS "Employee can delete endorsement items" ON public.leave_endorsement_items;
CREATE POLICY "Employee can delete endorsement items"
ON public.leave_endorsement_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = leave_endorsement_items.endorsement_id
    AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission', 'pending_acknowledgement')
  )
);

-- Allow employee to manage assignees on pending_acknowledgement endorsements
DROP POLICY IF EXISTS "Employee can manage item assignees" ON public.endorsement_item_assignees;
CREATE POLICY "Employee can manage item assignees"
ON public.endorsement_item_assignees
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leave_endorsement_items lei
    JOIN public.leave_endorsements e ON e.id = lei.endorsement_id
    WHERE lei.id = endorsement_item_assignees.endorsement_item_id
    AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission', 'pending_acknowledgement')
  )
);

DROP POLICY IF EXISTS "Employee can delete item assignees" ON public.endorsement_item_assignees;
CREATE POLICY "Employee can delete item assignees"
ON public.endorsement_item_assignees
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leave_endorsement_items lei
    JOIN public.leave_endorsements e ON e.id = lei.endorsement_id
    WHERE lei.id = endorsement_item_assignees.endorsement_item_id
    AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission', 'pending_acknowledgement')
  )
);

-- Allow employee to manage references on pending_acknowledgement endorsements
DROP POLICY IF EXISTS "Employee can manage endorsement references" ON public.leave_endorsement_references;
CREATE POLICY "Employee can manage endorsement references"
ON public.leave_endorsement_references
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = leave_endorsement_references.endorsement_id
    AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission', 'pending_acknowledgement')
  )
);

DROP POLICY IF EXISTS "Employee can update endorsement references" ON public.leave_endorsement_references;
CREATE POLICY "Employee can update endorsement references"
ON public.leave_endorsement_references
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = leave_endorsement_references.endorsement_id
    AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission', 'pending_acknowledgement')
  )
);

DROP POLICY IF EXISTS "Employee can delete endorsement references" ON public.leave_endorsement_references;
CREATE POLICY "Employee can delete endorsement references"
ON public.leave_endorsement_references
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = leave_endorsement_references.endorsement_id
    AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission', 'pending_acknowledgement')
  )
);
