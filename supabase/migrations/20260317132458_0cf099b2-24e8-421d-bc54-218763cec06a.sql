
-- 1. Global approval settings (singleton)
CREATE TABLE public.leave_approval_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  fallback_approver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  default_approval_mode text NOT NULL DEFAULT 'single',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Approver groups
CREATE TABLE public.leave_approver_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  approval_mode text NOT NULL DEFAULT 'single',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Group members (employees assigned to a group)
CREATE TABLE public.leave_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.leave_approver_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- 4. Group approvers
CREATE TABLE public.leave_group_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.leave_approver_groups(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, approver_id)
);

-- 5. Individual overrides
CREATE TABLE public.leave_approver_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  approval_mode text NOT NULL DEFAULT 'single',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Override approvers
CREATE TABLE public.leave_override_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id uuid NOT NULL REFERENCES public.leave_approver_overrides(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(override_id, approver_id)
);

-- 7. Update leave_requests with new approval columns
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS approver_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approval_mode text DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS approvals_completed jsonb DEFAULT '[]';

-- 8. Enable RLS on all new tables
ALTER TABLE public.leave_approval_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_approver_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_group_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_approver_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_override_approvers ENABLE ROW LEVEL SECURITY;

-- 9. RLS: leave_approval_settings
CREATE POLICY "Anyone authenticated can read approval settings"
  ON public.leave_approval_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage approval settings"
  ON public.leave_approval_settings FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));

-- 10. RLS: leave_approver_groups
CREATE POLICY "Anyone authenticated can read approver groups"
  ON public.leave_approver_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage approver groups"
  ON public.leave_approver_groups FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));

-- 11. RLS: leave_group_members
CREATE POLICY "Anyone authenticated can read group members"
  ON public.leave_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage group members"
  ON public.leave_group_members FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));

-- 12. RLS: leave_group_approvers
CREATE POLICY "Anyone authenticated can read group approvers"
  ON public.leave_group_approvers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage group approvers"
  ON public.leave_group_approvers FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));

-- 13. RLS: leave_approver_overrides
CREATE POLICY "Anyone authenticated can read approver overrides"
  ON public.leave_approver_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage approver overrides"
  ON public.leave_approver_overrides FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));

-- 14. RLS: leave_override_approvers
CREATE POLICY "Anyone authenticated can read override approvers"
  ON public.leave_override_approvers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage override approvers"
  ON public.leave_override_approvers FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));

-- 15. Update leave_requests RLS to include approver_ids
DROP POLICY IF EXISTS "Users can read leave requests" ON public.leave_requests;
CREATE POLICY "Users can read leave requests"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR approver_id = auth.uid()
    OR auth.uid() = ANY(approver_ids)
    OR is_super_admin(auth.uid())
    OR is_any_dept_manager(auth.uid())
    OR status = 'approved'
  );

DROP POLICY IF EXISTS "Users and managers can update leave requests" ON public.leave_requests;
CREATE POLICY "Users and managers can update leave requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR approver_id = auth.uid()
    OR auth.uid() = ANY(approver_ids)
    OR is_super_admin(auth.uid())
  );

-- 16. Insert default settings row
INSERT INTO public.leave_approval_settings (enabled, default_approval_mode)
VALUES (false, 'single');
