
-- 1. Create table and function
CREATE TABLE IF NOT EXISTS public.leave_endorsement_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endorsement_id uuid NOT NULL REFERENCES public.leave_endorsements(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending',
  acknowledged_at timestamptz,
  completed_at timestamptz,
  notes text,
  last_updated_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endorsement_id, recipient_user_id)
);
ALTER TABLE public.leave_endorsement_recipients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_endorsement(_user_id uuid, _endorsement_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM leave_endorsements e WHERE e.id = _endorsement_id AND e.employee_user_id = _user_id)
    OR EXISTS (SELECT 1 FROM leave_endorsement_recipients r WHERE r.endorsement_id = _endorsement_id AND r.recipient_user_id = _user_id)
    OR EXISTS (SELECT 1 FROM endorsement_item_assignees eia JOIN leave_endorsement_items lei ON lei.id = eia.endorsement_item_id WHERE lei.endorsement_id = _endorsement_id AND eia.user_id = _user_id)
    OR is_super_admin(_user_id)
    OR is_pc_member(_user_id)
    OR EXISTS (SELECT 1 FROM department_members dm_mgr JOIN department_members dm_emp ON dm_emp.department_id = dm_mgr.department_id JOIN leave_endorsements e2 ON e2.employee_user_id = dm_emp.user_id WHERE e2.id = _endorsement_id AND dm_mgr.user_id = _user_id AND dm_mgr.is_manager = true)
$$;

-- 2. Migrate data
INSERT INTO leave_endorsement_recipients (endorsement_id, recipient_user_id, status, acknowledged_at)
SELECT id, primary_recipient_user_id,
  CASE WHEN status = 'acknowledged' THEN 'acknowledged' ELSE 'pending' END,
  CASE WHEN status = 'acknowledged' THEN acknowledged_at ELSE NULL END
FROM leave_endorsements WHERE primary_recipient_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO leave_endorsement_recipients (endorsement_id, recipient_user_id, status, acknowledged_at)
SELECT id, secondary_recipient_user_id,
  CASE WHEN status = 'acknowledged' THEN 'acknowledged' ELSE 'pending' END,
  CASE WHEN status = 'acknowledged' THEN acknowledged_at ELSE NULL END
FROM leave_endorsements WHERE secondary_recipient_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO leave_endorsement_recipients (endorsement_id, recipient_user_id, status)
SELECT DISTINCT lei.endorsement_id, eia.user_id, 'pending'
FROM endorsement_item_assignees eia
JOIN leave_endorsement_items lei ON lei.id = eia.endorsement_item_id
ON CONFLICT DO NOTHING;

UPDATE leave_endorsements SET status = 'open' WHERE status = 'pending_acknowledgement';
UPDATE leave_endorsements SET status = 'draft' WHERE status = 'pending_submission';

-- 3. Drop ALL old policies on ALL tables BEFORE dropping columns
DROP POLICY IF EXISTS "Recipient can view assigned endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Recipient can update for acknowledgement" ON leave_endorsements;
DROP POLICY IF EXISTS "Manager can view team endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Item assignees can view endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Manager can view department member endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Employee can view own endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Admin can view all endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Admin can update endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Employee can update own endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Employee can insert own endorsements" ON leave_endorsements;
DROP POLICY IF EXISTS "Employee can delete own draft endorsements" ON leave_endorsements;

DROP POLICY IF EXISTS "Users can view endorsement audit log" ON endorsement_audit_log;
DROP POLICY IF EXISTS "Users can view item assignees" ON endorsement_item_assignees;
DROP POLICY IF EXISTS "Users can view endorsement items" ON leave_endorsement_items;
DROP POLICY IF EXISTS "Users can view endorsement references" ON leave_endorsement_references;

-- 4. Now drop old columns
ALTER TABLE leave_endorsements DROP COLUMN IF EXISTS primary_recipient_user_id;
ALTER TABLE leave_endorsements DROP COLUMN IF EXISTS secondary_recipient_user_id;
ALTER TABLE leave_endorsements DROP COLUMN IF EXISTS acknowledged_by;
ALTER TABLE leave_endorsements DROP COLUMN IF EXISTS acknowledged_at;
ALTER TABLE leave_endorsements DROP COLUMN IF EXISTS acknowledgement_note;
ALTER TABLE leave_endorsements DROP COLUMN IF EXISTS coverage_notes;

-- 5. Recreate all RLS policies

-- leave_endorsements
CREATE POLICY "Anyone can view endorsements they have access to" ON leave_endorsements FOR SELECT TO authenticated USING (can_view_endorsement(auth.uid(), id));
CREATE POLICY "Employee can insert own endorsements" ON leave_endorsements FOR INSERT TO authenticated WITH CHECK (employee_user_id = auth.uid());
CREATE POLICY "Employee can update own endorsements" ON leave_endorsements FOR UPDATE TO authenticated USING (employee_user_id = auth.uid() AND status IN ('draft', 'open', 'acknowledged', 'in_progress')) WITH CHECK (employee_user_id = auth.uid());
CREATE POLICY "Admin can update endorsements" ON leave_endorsements FOR UPDATE TO authenticated USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));
CREATE POLICY "Employee can delete own draft endorsements" ON leave_endorsements FOR DELETE TO authenticated USING ((employee_user_id = auth.uid() AND status = 'draft') OR is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));

-- leave_endorsement_recipients
CREATE POLICY "Users can view endorsement recipients" ON leave_endorsement_recipients FOR SELECT TO authenticated USING (recipient_user_id = auth.uid() OR can_view_endorsement(auth.uid(), endorsement_id));
CREATE POLICY "Creator can insert endorsement recipients" ON leave_endorsement_recipients FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM leave_endorsements e WHERE e.id = endorsement_id AND e.employee_user_id = auth.uid() AND e.status IN ('draft', 'open')) OR is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));
CREATE POLICY "Creator can delete endorsement recipients" ON leave_endorsement_recipients FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM leave_endorsements e WHERE e.id = endorsement_id AND e.employee_user_id = auth.uid() AND e.status IN ('draft', 'open')) OR is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));
CREATE POLICY "Recipients can update their own record" ON leave_endorsement_recipients FOR UPDATE TO authenticated USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());
CREATE POLICY "Admin can manage all recipients" ON leave_endorsement_recipients FOR ALL TO authenticated USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid())) WITH CHECK (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));

-- Related tables
CREATE POLICY "Users can view endorsement audit log" ON endorsement_audit_log FOR SELECT TO authenticated USING (can_view_endorsement(auth.uid(), endorsement_id));
CREATE POLICY "Users can view item assignees" ON endorsement_item_assignees FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM leave_endorsement_items lei WHERE lei.id = endorsement_item_id AND can_view_endorsement(auth.uid(), lei.endorsement_id)));
CREATE POLICY "Users can view endorsement items" ON leave_endorsement_items FOR SELECT TO authenticated USING (can_view_endorsement(auth.uid(), endorsement_id));
CREATE POLICY "Users can view endorsement references" ON leave_endorsement_references FOR SELECT TO authenticated USING (can_view_endorsement(auth.uid(), endorsement_id));
