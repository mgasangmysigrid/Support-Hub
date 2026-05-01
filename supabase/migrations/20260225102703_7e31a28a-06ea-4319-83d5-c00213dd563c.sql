
-- Junction table for multi-department tickets
CREATE TABLE public.ticket_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, department_id)
);

ALTER TABLE public.ticket_departments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read ticket departments (needed for UI)
CREATE POLICY "Authenticated users can read ticket departments"
  ON public.ticket_departments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Requesters can insert ticket departments when creating
CREATE POLICY "Requesters can insert ticket departments"
  ON public.ticket_departments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_departments.ticket_id
      AND t.requester_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

-- Super admins can delete
CREATE POLICY "Super admin can delete ticket departments"
  ON public.ticket_departments FOR DELETE
  USING (is_super_admin(auth.uid()));

-- Update the tickets SELECT RLS to also check ticket_departments junction
DROP POLICY IF EXISTS "Users can view accessible tickets" ON public.tickets;

CREATE POLICY "Users can view accessible tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR is_dept_manager(auth.uid(), department_id)
    OR EXISTS (
      SELECT 1 FROM public.ticket_assignees ta
      WHERE ta.ticket_id = tickets.id AND ta.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.ticket_departments td
      JOIN public.department_members dm ON dm.department_id = td.department_id
      WHERE td.ticket_id = tickets.id AND dm.user_id = auth.uid() AND dm.is_manager = true
    )
  );
