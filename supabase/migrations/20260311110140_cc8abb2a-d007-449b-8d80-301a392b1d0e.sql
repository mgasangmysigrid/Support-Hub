
-- Add primary_assignee_id to tickets table
ALTER TABLE public.tickets ADD COLUMN primary_assignee_id uuid REFERENCES public.profiles(id);

-- Populate from existing data: assignee_id first, fallback to requester_id
UPDATE public.tickets SET primary_assignee_id = COALESCE(assignee_id, requester_id);

-- Create ticket_collaborators table (mirrors ticket_assignees but excludes the owner)
CREATE TABLE public.ticket_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  added_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);

-- Enable RLS
ALTER TABLE public.ticket_collaborators ENABLE ROW LEVEL SECURITY;

-- RLS: anyone authenticated can read
CREATE POLICY "Authenticated can read collaborators"
  ON public.ticket_collaborators FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- RLS: owner, requester, managers, super_admin can add collaborators
CREATE POLICY "Authorized users can add collaborators"
  ON public.ticket_collaborators FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_collaborators.ticket_id
      AND (
        t.primary_assignee_id = auth.uid()
        OR t.requester_id = auth.uid()
        OR public.is_super_admin(auth.uid())
        OR public.is_dept_manager(auth.uid(), t.department_id)
        OR public.is_ticket_assignee(auth.uid(), t.id)
      )
    )
  );

-- RLS: owner, managers, super_admin can remove collaborators
CREATE POLICY "Authorized users can remove collaborators"
  ON public.ticket_collaborators FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_collaborators.ticket_id
      AND (
        t.primary_assignee_id = auth.uid()
        OR public.is_super_admin(auth.uid())
        OR public.is_dept_manager(auth.uid(), t.department_id)
      )
    )
  );

-- Migrate existing ticket_assignees to ticket_collaborators (excluding the owner/primary_assignee)
INSERT INTO public.ticket_collaborators (ticket_id, user_id, added_by, created_at)
SELECT ta.ticket_id, ta.user_id, ta.added_by, ta.created_at
FROM public.ticket_assignees ta
JOIN public.tickets t ON t.id = ta.ticket_id
WHERE ta.user_id != COALESCE(t.primary_assignee_id, t.assignee_id, t.requester_id)
ON CONFLICT (ticket_id, user_id) DO NOTHING;

-- Update can_access_ticket to include primary_assignee_id and ticket_collaborators
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
      OR t.primary_assignee_id = _user_id
      OR t.assignee_id = _user_id
      OR EXISTS (
        SELECT 1 FROM public.ticket_assignees ta
        WHERE ta.ticket_id = t.id AND ta.user_id = _user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.ticket_collaborators tc
        WHERE tc.ticket_id = t.id AND tc.user_id = _user_id
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

-- Update is_ticket_assignee to also check ticket_collaborators
CREATE OR REPLACE FUNCTION public.is_ticket_assignee(_user_id uuid, _ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ticket_assignees
    WHERE ticket_id = _ticket_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.ticket_collaborators
    WHERE ticket_id = _ticket_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.tickets
    WHERE id = _ticket_id AND primary_assignee_id = _user_id
  )
$$;
