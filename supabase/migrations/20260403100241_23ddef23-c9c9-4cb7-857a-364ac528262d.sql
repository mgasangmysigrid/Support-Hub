
-- Endorsement statuses enum
CREATE TYPE public.endorsement_status AS ENUM ('draft', 'pending_submission', 'pending_acknowledgement', 'acknowledged', 'cancelled');

-- Urgency level enum
CREATE TYPE public.endorsement_urgency AS ENUM ('normal', 'high', 'critical');

-- Task type enum
CREATE TYPE public.endorsement_task_type AS ENUM ('daily_recurring', 'weekly_recurring', 'monthly_recurring', 'one_time', 'client_follow_up', 'internal_admin', 'monitoring');

-- Task priority enum
CREATE TYPE public.endorsement_priority AS ENUM ('normal', 'high', 'critical');

-- Main endorsements table
CREATE TABLE public.leave_endorsements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  leave_request_id UUID NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES public.profiles(id),
  department_id UUID REFERENCES public.departments(id),
  leave_type TEXT NOT NULL,
  leave_start_date DATE NOT NULL,
  leave_end_date DATE NOT NULL,
  return_date DATE,
  manager_user_id UUID REFERENCES public.profiles(id),
  primary_recipient_user_id UUID REFERENCES public.profiles(id),
  secondary_recipient_user_id UUID REFERENCES public.profiles(id),
  coverage_notes TEXT,
  urgency_level endorsement_urgency NOT NULL DEFAULT 'normal',
  risk_notes TEXT,
  pending_issues TEXT,
  time_sensitive_deadlines TEXT,
  important_warnings TEXT,
  status endorsement_status NOT NULL DEFAULT 'draft',
  system_generated BOOLEAN NOT NULL DEFAULT true,
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES public.profiles(id),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.profiles(id),
  acknowledgement_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE(leave_request_id)
);

-- Endorsement items table
CREATE TABLE public.leave_endorsement_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endorsement_id UUID NOT NULL REFERENCES public.leave_endorsements(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  client_name TEXT,
  task_name TEXT NOT NULL,
  task_type endorsement_task_type NOT NULL DEFAULT 'one_time',
  task_details TEXT NOT NULL,
  next_steps TEXT,
  endorsed_to_user_id UUID REFERENCES public.profiles(id),
  due_date DATE,
  frequency TEXT,
  priority endorsement_priority NOT NULL DEFAULT 'normal',
  backup_notes TEXT,
  reference_links JSONB,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Endorsement references table
CREATE TABLE public.leave_endorsement_references (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endorsement_id UUID NOT NULL REFERENCES public.leave_endorsements(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leave_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_endorsement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_endorsement_references ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leave_endorsements
CREATE POLICY "Employee can view own endorsements"
  ON public.leave_endorsements FOR SELECT TO authenticated
  USING (employee_user_id = auth.uid());

CREATE POLICY "Recipient can view assigned endorsements"
  ON public.leave_endorsements FOR SELECT TO authenticated
  USING (primary_recipient_user_id = auth.uid() OR secondary_recipient_user_id = auth.uid());

CREATE POLICY "Manager can view team endorsements"
  ON public.leave_endorsements FOR SELECT TO authenticated
  USING (manager_user_id = auth.uid());

CREATE POLICY "Admin can view all endorsements"
  ON public.leave_endorsements FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_pc_member(auth.uid()));

CREATE POLICY "Employee can insert own endorsements"
  ON public.leave_endorsements FOR INSERT TO authenticated
  WITH CHECK (employee_user_id = auth.uid());

CREATE POLICY "System can insert endorsements"
  ON public.leave_endorsements FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Employee can update own draft endorsements"
  ON public.leave_endorsements FOR UPDATE TO authenticated
  USING (employee_user_id = auth.uid() AND status IN ('draft', 'pending_submission'))
  WITH CHECK (employee_user_id = auth.uid());

CREATE POLICY "Recipient can update for acknowledgement"
  ON public.leave_endorsements FOR UPDATE TO authenticated
  USING ((primary_recipient_user_id = auth.uid() OR secondary_recipient_user_id = auth.uid()) AND status = 'pending_acknowledgement')
  WITH CHECK (primary_recipient_user_id = auth.uid() OR secondary_recipient_user_id = auth.uid());

CREATE POLICY "Admin can update endorsements"
  ON public.leave_endorsements FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_pc_member(auth.uid()));

-- RLS Policies for leave_endorsement_items
CREATE POLICY "Users can view endorsement items"
  ON public.leave_endorsement_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_id
    AND (e.employee_user_id = auth.uid() OR e.primary_recipient_user_id = auth.uid()
         OR e.secondary_recipient_user_id = auth.uid() OR e.manager_user_id = auth.uid()
         OR public.is_super_admin(auth.uid()) OR public.is_pc_member(auth.uid()))
  ));

CREATE POLICY "Employee can manage endorsement items"
  ON public.leave_endorsement_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_id AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission')
  ));

CREATE POLICY "Employee can update endorsement items"
  ON public.leave_endorsement_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_id AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission')
  ));

CREATE POLICY "Employee can delete endorsement items"
  ON public.leave_endorsement_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_id AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission')
  ));

-- RLS Policies for leave_endorsement_references
CREATE POLICY "Users can view endorsement references"
  ON public.leave_endorsement_references FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_id
    AND (e.employee_user_id = auth.uid() OR e.primary_recipient_user_id = auth.uid()
         OR e.secondary_recipient_user_id = auth.uid() OR e.manager_user_id = auth.uid()
         OR public.is_super_admin(auth.uid()) OR public.is_pc_member(auth.uid()))
  ));

CREATE POLICY "Employee can manage endorsement references"
  ON public.leave_endorsement_references FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_id AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission')
  ));

CREATE POLICY "Employee can update endorsement references"
  ON public.leave_endorsement_references FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_id AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission')
  ));

CREATE POLICY "Employee can delete endorsement references"
  ON public.leave_endorsement_references FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leave_endorsements e
    WHERE e.id = endorsement_id AND e.employee_user_id = auth.uid()
    AND e.status IN ('draft', 'pending_submission')
  ));

-- Indexes
CREATE INDEX idx_leave_endorsements_employee ON public.leave_endorsements(employee_user_id);
CREATE INDEX idx_leave_endorsements_recipient ON public.leave_endorsements(primary_recipient_user_id);
CREATE INDEX idx_leave_endorsements_leave_request ON public.leave_endorsements(leave_request_id);
CREATE INDEX idx_leave_endorsements_status ON public.leave_endorsements(status);
CREATE INDEX idx_leave_endorsement_items_endorsement ON public.leave_endorsement_items(endorsement_id);
CREATE INDEX idx_leave_endorsement_references_endorsement ON public.leave_endorsement_references(endorsement_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_endorsement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_leave_endorsements_updated_at
  BEFORE UPDATE ON public.leave_endorsements
  FOR EACH ROW EXECUTE FUNCTION public.update_endorsement_updated_at();

CREATE TRIGGER update_leave_endorsement_items_updated_at
  BEFORE UPDATE ON public.leave_endorsement_items
  FOR EACH ROW EXECUTE FUNCTION public.update_endorsement_updated_at();

CREATE TRIGGER update_leave_endorsement_references_updated_at
  BEFORE UPDATE ON public.leave_endorsement_references
  FOR EACH ROW EXECUTE FUNCTION public.update_endorsement_updated_at();

-- Auto-create endorsement and notify when leave is approved
CREATE OR REPLACE FUNCTION public.auto_create_endorsement_on_approval()
RETURNS TRIGGER AS $$
DECLARE
  _employee RECORD;
  _dept_id UUID;
  _manager_id UUID;
BEGIN
  -- Only on status change to approved
  IF NEW.status != 'approved' THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  -- Check if endorsement already exists
  IF EXISTS (SELECT 1 FROM public.leave_endorsements WHERE leave_request_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Get employee details
  SELECT p.id, p.reporting_manager_id INTO _employee
  FROM public.profiles p WHERE p.id = NEW.user_id;

  -- Get department
  SELECT dm.department_id INTO _dept_id
  FROM public.department_members dm WHERE dm.user_id = NEW.user_id LIMIT 1;

  -- Get manager
  _manager_id := _employee.reporting_manager_id;

  -- Create endorsement entry
  INSERT INTO public.leave_endorsements (
    leave_request_id, employee_user_id, department_id,
    leave_type, leave_start_date, leave_end_date,
    return_date, manager_user_id, status, system_generated
  ) VALUES (
    NEW.id, NEW.user_id, _dept_id,
    NEW.leave_type::text, NEW.date_from::date, NEW.date_to::date,
    (NEW.date_to::date + interval '1 day')::date,
    _manager_id, 'draft', true
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER auto_create_endorsement_on_leave_approval
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_endorsement_on_approval();

-- Notification trigger for endorsement submission
CREATE OR REPLACE FUNCTION public.notify_on_endorsement_submitted()
RETURNS TRIGGER AS $$
DECLARE
  _employee_name TEXT;
BEGIN
  IF NEW.status != 'pending_acknowledgement' THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.status = 'pending_acknowledgement' THEN RETURN NEW; END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _employee_name
  FROM public.profiles p WHERE p.id = NEW.employee_user_id;

  -- Notify primary recipient
  IF NEW.primary_recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
    VALUES (
      NEW.primary_recipient_user_id,
      'endorsement_submitted',
      'Endorsement Acknowledgement Required',
      _employee_name || ' submitted an endorsement entry for your acknowledgement',
      '/leave/endorsements',
      NEW.employee_user_id
    );
  END IF;

  -- Notify secondary recipient
  IF NEW.secondary_recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
    VALUES (
      NEW.secondary_recipient_user_id,
      'endorsement_submitted',
      'Endorsement Acknowledgement Required',
      _employee_name || ' submitted an endorsement entry for your acknowledgement',
      '/leave/endorsements',
      NEW.employee_user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER notify_endorsement_submitted
  AFTER UPDATE ON public.leave_endorsements
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_endorsement_submitted();
