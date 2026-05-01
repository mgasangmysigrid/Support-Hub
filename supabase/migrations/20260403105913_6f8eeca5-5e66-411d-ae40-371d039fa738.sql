
-- Add RLS policy for managers to view endorsements of their department members
CREATE POLICY "Manager can view department member endorsements"
ON public.leave_endorsements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM department_members dm_mgr
    JOIN department_members dm_emp ON dm_emp.department_id = dm_mgr.department_id
    WHERE dm_mgr.user_id = auth.uid()
      AND dm_mgr.is_manager = true
      AND dm_emp.user_id = leave_endorsements.employee_user_id
  )
);

-- Update audit log SELECT policy to also allow managers who can see the endorsement
DROP POLICY IF EXISTS "Users can view endorsement audit log" ON public.endorsement_audit_log;
CREATE POLICY "Users can view endorsement audit log"
ON public.endorsement_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM leave_endorsements e
    WHERE e.id = endorsement_audit_log.endorsement_id
      AND (
        e.employee_user_id = auth.uid()
        OR e.primary_recipient_user_id = auth.uid()
        OR e.secondary_recipient_user_id = auth.uid()
        OR e.manager_user_id = auth.uid()
        OR is_super_admin(auth.uid())
        OR is_pc_member(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM department_members dm_mgr
          JOIN department_members dm_emp ON dm_emp.department_id = dm_mgr.department_id
          WHERE dm_mgr.user_id = auth.uid()
            AND dm_mgr.is_manager = true
            AND dm_emp.user_id = e.employee_user_id
        )
      )
  )
);

-- Update endorsement_item_assignees SELECT policy for managers
DROP POLICY IF EXISTS "Users can view item assignees" ON public.endorsement_item_assignees;
CREATE POLICY "Users can view item assignees"
ON public.endorsement_item_assignees
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM leave_endorsement_items lei
    JOIN leave_endorsements e ON e.id = lei.endorsement_id
    WHERE lei.id = endorsement_item_assignees.endorsement_item_id
      AND (
        e.employee_user_id = auth.uid()
        OR e.primary_recipient_user_id = auth.uid()
        OR e.secondary_recipient_user_id = auth.uid()
        OR e.manager_user_id = auth.uid()
        OR is_super_admin(auth.uid())
        OR is_pc_member(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM department_members dm_mgr
          JOIN department_members dm_emp ON dm_emp.department_id = dm_mgr.department_id
          WHERE dm_mgr.user_id = auth.uid()
            AND dm_mgr.is_manager = true
            AND dm_emp.user_id = e.employee_user_id
        )
      )
  )
);
