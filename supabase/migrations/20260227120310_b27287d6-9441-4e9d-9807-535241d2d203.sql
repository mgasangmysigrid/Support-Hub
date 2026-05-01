
DROP POLICY IF EXISTS "Managers and admins can update tickets" ON public.tickets;

CREATE POLICY "Managers and admins can update tickets"
ON public.tickets
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR is_dept_manager(auth.uid(), department_id)
  OR (requester_id = auth.uid())
  OR (assignee_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.ticket_assignees ta
    WHERE ta.ticket_id = tickets.id AND ta.user_id = auth.uid()
  )
);
