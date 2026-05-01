
-- Drop existing restrictive policies on ticket_departments
DROP POLICY IF EXISTS "Requesters can insert ticket departments" ON public.ticket_departments;
DROP POLICY IF EXISTS "Super admin can delete ticket departments" ON public.ticket_departments;

-- Assignees, managers, and super admins can insert ticket departments
CREATE POLICY "Assignees and managers can insert ticket departments"
ON public.ticket_departments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_departments.ticket_id
    AND t.status IN ('open', 'in_progress')
    AND (
      t.requester_id = auth.uid()
      OR public.is_super_admin(auth.uid())
      OR public.is_dept_manager(auth.uid(), t.department_id)
      OR EXISTS (
        SELECT 1 FROM public.ticket_assignees ta
        WHERE ta.ticket_id = t.id AND ta.user_id = auth.uid()
      )
    )
  )
);

-- Assignees, managers, and super admins can delete ticket departments
CREATE POLICY "Assignees and managers can delete ticket departments"
ON public.ticket_departments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_departments.ticket_id
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_dept_manager(auth.uid(), t.department_id)
      OR EXISTS (
        SELECT 1 FROM public.ticket_assignees ta
        WHERE ta.ticket_id = t.id AND ta.user_id = auth.uid()
      )
    )
  )
);
