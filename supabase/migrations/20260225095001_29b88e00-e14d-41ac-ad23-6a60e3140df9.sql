
DROP POLICY IF EXISTS "Users can view accessible tickets" ON public.tickets;

CREATE POLICY "Users can view accessible tickets"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR requester_id = auth.uid()
  OR assignee_id = auth.uid()
  OR is_dept_manager(auth.uid(), department_id)
  OR EXISTS (
    SELECT 1 FROM public.ticket_assignees ta
    WHERE ta.ticket_id = id AND ta.user_id = auth.uid()
  )
);
