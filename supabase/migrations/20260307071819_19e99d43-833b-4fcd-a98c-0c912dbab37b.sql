-- Fix RLS: Allow employees to update/delete pto_ledger and pto_allocations during cancellation reversal

CREATE POLICY "Users can update own PTO ledger"
ON public.pto_ledger FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own PTO ledger"
ON public.pto_ledger FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own allocations"
ON public.pto_allocations FOR DELETE
USING (EXISTS (
  SELECT 1 FROM pto_ledger pl
  WHERE pl.id = pto_allocations.deduction_ledger_id
  AND pl.user_id = auth.uid()
));

CREATE POLICY "Users can read own allocations directly"
ON public.pto_allocations FOR SELECT
USING (EXISTS (
  SELECT 1 FROM pto_ledger pl
  WHERE pl.id = pto_allocations.accrual_ledger_id
  AND pl.user_id = auth.uid()
));

CREATE POLICY "Users can insert own PTO ledger"
ON public.pto_ledger FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Leave notification: notify manager on submission
CREATE OR REPLACE FUNCTION public.notify_on_leave_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _employee_name text;
  _manager_id uuid;
BEGIN
  IF NEW.status != 'submitted' THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.status = 'submitted' THEN RETURN NEW; END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _employee_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  SELECT dm.user_id INTO _manager_id
  FROM public.department_members dm2
  JOIN public.department_members dm ON dm.department_id = dm2.department_id AND dm.is_manager = true
  WHERE dm2.user_id = NEW.user_id
  LIMIT 1;

  _manager_id := COALESCE(NEW.approver_id, _manager_id);

  IF _manager_id IS NOT NULL AND _manager_id != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      _manager_id, 'leave_submitted',
      'Leave Request from ' || _employee_name,
      _employee_name || ' submitted a ' || REPLACE(NEW.leave_type::text, '_', ' ') || ' request for ' || NEW.date_from || ' to ' || NEW.date_to,
      '/leave/approvals'
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Leave notification: notify employee on approval/decline
CREATE OR REPLACE FUNCTION public.notify_on_leave_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _approver_name text;
  _title text;
  _body text;
BEGIN
  IF NEW.status NOT IN ('approved', 'declined') THEN RETURN NEW; END IF;
  IF OLD IS NULL OR OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _approver_name
  FROM public.profiles p WHERE p.id = NEW.approved_by;

  IF NEW.status = 'approved' THEN
    _title := 'Leave Request Approved';
    _body := COALESCE(_approver_name, 'Manager') || ' approved your ' || REPLACE(NEW.leave_type::text, '_', ' ') || ' request for ' || NEW.date_from || ' to ' || NEW.date_to;
  ELSE
    _title := 'Leave Request Declined';
    _body := COALESCE(_approver_name, 'Manager') || ' declined your request for ' || NEW.date_from || ' to ' || NEW.date_to || COALESCE('. Reason: ' || NEW.decline_notes, '');
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'leave_' || NEW.status, _title, _body, '/leave/my-leave');
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_leave_submitted
  AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_leave_submitted();

CREATE TRIGGER trg_leave_decision
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_leave_decision();