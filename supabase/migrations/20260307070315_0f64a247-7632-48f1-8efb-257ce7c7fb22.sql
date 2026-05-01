
-- Extend departments table for capacity
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS max_out_per_day integer NOT NULL DEFAULT 2;

-- Create schedules table
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  working_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  hours_per_day numeric(4,2) NOT NULL DEFAULT 8.00,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Extend profiles for leave management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accrual_start_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.schedules(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS probation_end_date date;

-- Create leave-specific enums
CREATE TYPE public.leave_status AS ENUM ('draft', 'submitted', 'approved', 'declined', 'cancelled', 'withdrawn');
CREATE TYPE public.leave_type_enum AS ENUM ('paid_pto', 'unpaid_leave');
CREATE TYPE public.duration_type_enum AS ENUM ('full_day', 'half_day_am', 'half_day_pm');
CREATE TYPE public.pto_entry_type AS ENUM ('accrual', 'deduction', 'adjustment', 'reversal', 'expired');

-- Create leave_requests table
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES public.profiles(id),
  leave_type leave_type_enum NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  duration_type duration_type_enum NOT NULL DEFAULT 'full_day',
  total_hours numeric(8,4) NOT NULL DEFAULT 0,
  working_days_count numeric(6,2) NOT NULL DEFAULT 0,
  notice_rule_met boolean NOT NULL DEFAULT true,
  reason text,
  notes text,
  status leave_status NOT NULL DEFAULT 'draft',
  decline_notes text,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create PTO ledger table
CREATE TABLE public.pto_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_type pto_entry_type NOT NULL,
  hours numeric(10,4) NOT NULL,
  earned_at date,
  expires_at date,
  remaining_hours numeric(10,4),
  related_request_id uuid REFERENCES public.leave_requests(id),
  created_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create PTO allocations table (FIFO tracking)
CREATE TABLE public.pto_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deduction_ledger_id uuid NOT NULL REFERENCES public.pto_ledger(id) ON DELETE CASCADE,
  accrual_ledger_id uuid NOT NULL REFERENCES public.pto_ledger(id) ON DELETE CASCADE,
  hours_allocated numeric(10,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create leave audit log table
CREATE TABLE public.leave_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_snapshot jsonb,
  after_snapshot jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default Mon-Fri schedule
INSERT INTO public.schedules (name, working_days, hours_per_day, is_default)
VALUES ('Mon-Fri', '{1,2,3,4,5}', 8.00, true);

-- Enable RLS on all new tables
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pto_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pto_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_audit_log ENABLE ROW LEVEL SECURITY;

-- Schedules RLS
CREATE POLICY "Anyone authenticated can read schedules" ON public.schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin can manage schedules" ON public.schedules FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- Leave requests RLS
CREATE POLICY "Users can read leave requests" ON public.leave_requests FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR approver_id = auth.uid() OR is_super_admin(auth.uid()) OR is_any_dept_manager(auth.uid()) OR status = 'approved'
);
CREATE POLICY "Users can create own leave requests" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users and managers can update leave requests" ON public.leave_requests FOR UPDATE TO authenticated USING (
  user_id = auth.uid() OR is_super_admin(auth.uid()) OR is_any_dept_manager(auth.uid())
);

-- PTO ledger RLS
CREATE POLICY "Users can read own PTO ledger" ON public.pto_ledger FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_super_admin(auth.uid()) OR is_any_dept_manager(auth.uid())
);
CREATE POLICY "Admin and managers can insert PTO ledger" ON public.pto_ledger FOR INSERT TO authenticated WITH CHECK (
  is_super_admin(auth.uid()) OR is_any_dept_manager(auth.uid())
);
CREATE POLICY "Admin can update PTO ledger" ON public.pto_ledger FOR UPDATE TO authenticated USING (is_super_admin(auth.uid()));

-- PTO allocations RLS
CREATE POLICY "Users can read own allocations" ON public.pto_allocations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.pto_ledger pl WHERE pl.id = pto_allocations.deduction_ledger_id AND (pl.user_id = auth.uid() OR is_super_admin(auth.uid())))
);
CREATE POLICY "Admin and managers can insert allocations" ON public.pto_allocations FOR INSERT TO authenticated WITH CHECK (
  is_super_admin(auth.uid()) OR is_any_dept_manager(auth.uid())
);

-- Leave audit log RLS
CREATE POLICY "Users can read relevant audit logs" ON public.leave_audit_log FOR SELECT TO authenticated USING (
  is_super_admin(auth.uid()) OR is_any_dept_manager(auth.uid())
  OR (entity_type = 'leave_request' AND EXISTS (SELECT 1 FROM public.leave_requests lr WHERE lr.id = entity_id AND lr.user_id = auth.uid()))
);
CREATE POLICY "Authenticated users can insert audit log" ON public.leave_audit_log FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- Enable realtime for leave_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
