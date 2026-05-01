
-- Make leave_request_id nullable for manual endorsements
ALTER TABLE public.leave_endorsements ALTER COLUMN leave_request_id DROP NOT NULL;

-- Update the auto-creation trigger to also check for matching drafts by employee+dates
CREATE OR REPLACE FUNCTION public.auto_create_endorsement_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employee RECORD;
  _dept_id UUID;
  _manager_id UUID;
  _existing_id UUID;
BEGIN
  -- Only on status change to approved
  IF NEW.status != 'approved' THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  -- Check if endorsement already exists for this leave request
  IF EXISTS (SELECT 1 FROM public.leave_endorsements WHERE leave_request_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Check if a manually created endorsement exists for same employee + same dates in active status
  SELECT id INTO _existing_id
  FROM public.leave_endorsements
  WHERE employee_user_id = NEW.user_id
    AND leave_start_date = NEW.date_from::date
    AND leave_end_date = NEW.date_to::date
    AND leave_request_id IS NULL
    AND status IN ('draft', 'pending_submission', 'pending_acknowledgement', 'acknowledged')
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    -- Link the existing manual endorsement to this leave request
    UPDATE public.leave_endorsements
    SET leave_request_id = NEW.id,
        leave_type = NEW.leave_type::text,
        updated_at = now()
    WHERE id = _existing_id;
    RETURN NEW;
  END IF;

  -- Get employee details
  SELECT p.id, p.reporting_manager_id INTO _employee
  FROM public.profiles p WHERE p.id = NEW.user_id;

  -- Get department
  SELECT dm.department_id INTO _dept_id
  FROM public.department_members dm WHERE dm.user_id = NEW.user_id LIMIT 1;

  _manager_id := _employee.reporting_manager_id;

  -- Create endorsement
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
$$;

-- Update notification trigger text
CREATE OR REPLACE FUNCTION public.notify_on_endorsement_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employee_name TEXT;
BEGIN
  IF NEW.status != 'pending_acknowledgement' THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.status = 'pending_acknowledgement' THEN RETURN NEW; END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _employee_name
  FROM public.profiles p WHERE p.id = NEW.employee_user_id;

  IF NEW.primary_recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
    VALUES (
      NEW.primary_recipient_user_id,
      'endorsement_submitted',
      'Acknowledgement Required',
      _employee_name || ' submitted an endorsement for your acknowledgement',
      '/leave/endorsements',
      NEW.employee_user_id
    );
  END IF;

  IF NEW.secondary_recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
    VALUES (
      NEW.secondary_recipient_user_id,
      'endorsement_submitted',
      'Acknowledgement Required',
      _employee_name || ' submitted an endorsement for your acknowledgement',
      '/leave/endorsements',
      NEW.employee_user_id
    );
  END IF;

  RETURN NEW;
END;
$$;
