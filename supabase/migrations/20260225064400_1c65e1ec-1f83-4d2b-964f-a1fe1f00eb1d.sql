
-- Create ticket_assignees junction table for multi-assignee support
CREATE TABLE public.ticket_assignees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  added_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);

-- Enable RLS
ALTER TABLE public.ticket_assignees ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can read assignees for tickets they can access
CREATE POLICY "Authenticated users can read ticket assignees"
  ON public.ticket_assignees
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Assignees, managers, and super admins can insert new assignees
CREATE POLICY "Assignees and managers can add assignees"
  ON public.ticket_assignees
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
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

-- Assignees and managers can remove assignees
CREATE POLICY "Assignees and managers can remove assignees"
  ON public.ticket_assignees
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
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

-- Migrate existing assignee_id data to ticket_assignees
INSERT INTO public.ticket_assignees (ticket_id, user_id)
SELECT id, assignee_id FROM public.tickets
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update can_access_ticket to also check ticket_assignees
CREATE OR REPLACE FUNCTION public.can_access_ticket(_user_id uuid, _ticket_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = _ticket_id
    AND (
      public.is_super_admin(_user_id)
      OR t.requester_id = _user_id
      OR t.assignee_id = _user_id
      OR EXISTS (
        SELECT 1 FROM public.ticket_assignees ta
        WHERE ta.ticket_id = t.id AND ta.user_id = _user_id
      )
      OR public.is_dept_manager(_user_id, t.department_id)
      OR EXISTS (
        SELECT 1 FROM public.tickets child
        WHERE child.merged_into_id = _ticket_id
        AND child.requester_id = _user_id
      )
    )
  )
$$;

-- Create a helper function to check if user is an assignee (SECURITY DEFINER to avoid RLS issues)
CREATE OR REPLACE FUNCTION public.is_ticket_assignee(_user_id uuid, _ticket_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ticket_assignees
    WHERE ticket_id = _ticket_id AND user_id = _user_id
  )
$$;
