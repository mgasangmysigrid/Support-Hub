
-- 1. Create endorsement_item_assignees join table for multi-user "Endorse To"
CREATE TABLE public.endorsement_item_assignees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endorsement_item_id UUID NOT NULL REFERENCES public.leave_endorsement_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicates
ALTER TABLE public.endorsement_item_assignees ADD CONSTRAINT unique_item_assignee UNIQUE (endorsement_item_id, user_id);

-- RLS
ALTER TABLE public.endorsement_item_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view item assignees"
ON public.endorsement_item_assignees FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM leave_endorsement_items lei
  JOIN leave_endorsements e ON e.id = lei.endorsement_id
  WHERE lei.id = endorsement_item_assignees.endorsement_item_id
  AND (e.employee_user_id = auth.uid()
    OR e.primary_recipient_user_id = auth.uid()
    OR e.secondary_recipient_user_id = auth.uid()
    OR e.manager_user_id = auth.uid()
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid()))
));

CREATE POLICY "Employee can manage item assignees"
ON public.endorsement_item_assignees FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM leave_endorsement_items lei
  JOIN leave_endorsements e ON e.id = lei.endorsement_id
  WHERE lei.id = endorsement_item_assignees.endorsement_item_id
  AND e.employee_user_id = auth.uid()
  AND e.status IN ('draft', 'pending_submission')
));

CREATE POLICY "Employee can delete item assignees"
ON public.endorsement_item_assignees FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM leave_endorsement_items lei
  JOIN leave_endorsements e ON e.id = lei.endorsement_id
  WHERE lei.id = endorsement_item_assignees.endorsement_item_id
  AND e.employee_user_id = auth.uid()
  AND e.status IN ('draft', 'pending_submission')
));

-- 2. Add endorsement_notes and urgency to leave_endorsement_items
ALTER TABLE public.leave_endorsement_items
  ADD COLUMN IF NOT EXISTS endorsement_notes TEXT,
  ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'normal';

-- 3. Create endorsement_audit_log table
CREATE TABLE public.endorsement_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endorsement_id UUID NOT NULL REFERENCES public.leave_endorsements(id) ON DELETE CASCADE,
  endorsement_item_id UUID REFERENCES public.leave_endorsement_items(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.endorsement_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view endorsement audit log"
ON public.endorsement_audit_log FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM leave_endorsements e
  WHERE e.id = endorsement_audit_log.endorsement_id
  AND (e.employee_user_id = auth.uid()
    OR e.primary_recipient_user_id = auth.uid()
    OR e.secondary_recipient_user_id = auth.uid()
    OR e.manager_user_id = auth.uid()
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid()))
));

CREATE POLICY "Authenticated users can insert audit log"
ON public.endorsement_audit_log FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid());
