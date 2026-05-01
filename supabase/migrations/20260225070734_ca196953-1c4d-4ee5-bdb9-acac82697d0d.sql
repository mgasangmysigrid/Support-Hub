
DROP POLICY "Assignees and managers can add assignees" ON public.ticket_assignees;

CREATE POLICY "Assignees managers and requesters can add assignees"
ON public.ticket_assignees
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_assignees.ticket_id
    AND (
      is_super_admin(auth.uid())
      OR is_dept_manager(auth.uid(), t.department_id)
      OR t.requester_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM ticket_assignees ta
        WHERE ta.ticket_id = t.id AND ta.user_id = auth.uid()
      )
    )
  )
);
