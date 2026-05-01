
-- Create leave_endorsement_updates table
CREATE TABLE public.leave_endorsement_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endorsement_id uuid NOT NULL REFERENCES public.leave_endorsements(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  update_type text NOT NULL DEFAULT 'progress',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leave_endorsement_updates ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as parent endorsement
CREATE POLICY "Users can view endorsement updates"
  ON public.leave_endorsement_updates FOR SELECT TO authenticated
  USING (can_view_endorsement(auth.uid(), endorsement_id));

-- INSERT: anyone who can view can post updates
CREATE POLICY "Participants can insert endorsement updates"
  ON public.leave_endorsement_updates FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND can_view_endorsement(auth.uid(), endorsement_id)
  );

-- UPDATE: only own updates
CREATE POLICY "Authors can update own updates"
  ON public.leave_endorsement_updates FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

-- DELETE: own updates or admin
CREATE POLICY "Authors or admins can delete updates"
  ON public.leave_endorsement_updates FOR DELETE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );

-- Update RLS policies for endorsement_item_assignees, leave_endorsement_items, leave_endorsement_references
-- to use new status values instead of legacy pending_submission/pending_acknowledgement

-- Fix endorsement_item_assignees INSERT policy
DROP POLICY IF EXISTS "Employee can manage item assignees" ON public.endorsement_item_assignees;
CREATE POLICY "Employee can manage item assignees"
  ON public.endorsement_item_assignees FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leave_endorsement_items lei
      JOIN leave_endorsements e ON e.id = lei.endorsement_id
      WHERE lei.id = endorsement_item_assignees.endorsement_item_id
        AND e.employee_user_id = auth.uid()
        AND e.status IN ('draft', 'open')
    )
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );

-- Fix endorsement_item_assignees DELETE policy
DROP POLICY IF EXISTS "Employee can delete item assignees" ON public.endorsement_item_assignees;
CREATE POLICY "Employee can delete item assignees"
  ON public.endorsement_item_assignees FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leave_endorsement_items lei
      JOIN leave_endorsements e ON e.id = lei.endorsement_id
      WHERE lei.id = endorsement_item_assignees.endorsement_item_id
        AND e.employee_user_id = auth.uid()
        AND e.status IN ('draft', 'open')
    )
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );

-- Fix leave_endorsement_items INSERT policy
DROP POLICY IF EXISTS "Employee can manage endorsement items" ON public.leave_endorsement_items;
CREATE POLICY "Employee can manage endorsement items"
  ON public.leave_endorsement_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leave_endorsements e
      WHERE e.id = leave_endorsement_items.endorsement_id
        AND e.employee_user_id = auth.uid()
        AND e.status IN ('draft', 'open')
    )
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );

-- Fix leave_endorsement_items UPDATE policy
DROP POLICY IF EXISTS "Employee can update endorsement items" ON public.leave_endorsement_items;
CREATE POLICY "Employee can update endorsement items"
  ON public.leave_endorsement_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leave_endorsements e
      WHERE e.id = leave_endorsement_items.endorsement_id
        AND e.employee_user_id = auth.uid()
        AND e.status IN ('draft', 'open')
    )
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );

-- Fix leave_endorsement_items DELETE policy
DROP POLICY IF EXISTS "Employee can delete endorsement items" ON public.leave_endorsement_items;
CREATE POLICY "Employee can delete endorsement items"
  ON public.leave_endorsement_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leave_endorsements e
      WHERE e.id = leave_endorsement_items.endorsement_id
        AND e.employee_user_id = auth.uid()
        AND e.status IN ('draft', 'open')
    )
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );

-- Fix leave_endorsement_references INSERT policy
DROP POLICY IF EXISTS "Employee can manage endorsement references" ON public.leave_endorsement_references;
CREATE POLICY "Employee can manage endorsement references"
  ON public.leave_endorsement_references FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leave_endorsements e
      WHERE e.id = leave_endorsement_references.endorsement_id
        AND e.employee_user_id = auth.uid()
        AND e.status IN ('draft', 'open')
    )
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );

-- Fix leave_endorsement_references UPDATE policy
DROP POLICY IF EXISTS "Employee can update endorsement references" ON public.leave_endorsement_references;
CREATE POLICY "Employee can update endorsement references"
  ON public.leave_endorsement_references FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leave_endorsements e
      WHERE e.id = leave_endorsement_references.endorsement_id
        AND e.employee_user_id = auth.uid()
        AND e.status IN ('draft', 'open')
    )
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );

-- Fix leave_endorsement_references DELETE policy
DROP POLICY IF EXISTS "Employee can delete endorsement references" ON public.leave_endorsement_references;
CREATE POLICY "Employee can delete endorsement references"
  ON public.leave_endorsement_references FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leave_endorsements e
      WHERE e.id = leave_endorsement_references.endorsement_id
        AND e.employee_user_id = auth.uid()
        AND e.status IN ('draft', 'open')
    )
    OR is_super_admin(auth.uid())
    OR is_pc_member(auth.uid())
  );
