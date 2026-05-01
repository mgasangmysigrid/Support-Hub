
-- Trigger function: notify requester on ticket activity (status changes, assignment, etc.)
CREATE OR REPLACE FUNCTION public.notify_on_ticket_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ticket RECORD;
  _actor_name text;
  _title text;
  _body text;
BEGIN
  -- Get ticket info
  SELECT t.id, t.ticket_no, t.title AS ticket_title, t.requester_id, t.assignee_id
  INTO _ticket
  FROM public.tickets t
  WHERE t.id = NEW.ticket_id;

  -- Don't notify if actor is the requester themselves
  IF NEW.actor_id = _ticket.requester_id THEN
    RETURN NEW;
  END IF;

  -- Get actor name
  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _actor_name
  FROM public.profiles p WHERE p.id = NEW.actor_id;

  -- Build notification based on action
  CASE NEW.action
    WHEN 'assigned' THEN
      _title := 'Ticket Assigned';
      _body := _actor_name || ' assigned ' || _ticket.ticket_no || ' (' || _ticket.ticket_title || ')';
    WHEN 'status_changed' THEN
      _title := 'Status Updated';
      _body := _actor_name || ' changed status of ' || _ticket.ticket_no || ' to ' || COALESCE(NEW.to_value::text, 'unknown');
    WHEN 'priority_changed' THEN
      _title := 'Priority Updated';
      _body := _actor_name || ' changed priority of ' || _ticket.ticket_no || ' to ' || COALESCE(NEW.to_value::text, 'unknown');
    WHEN 'escalated_to_manager' THEN
      _title := 'Ticket Escalated';
      _body := _ticket.ticket_no || ' (' || _ticket.ticket_title || ') has been escalated to a manager';
    WHEN 'escalated_to_super_admin' THEN
      _title := 'Ticket Escalated';
      _body := _ticket.ticket_no || ' (' || _ticket.ticket_title || ') has been escalated to an owner';
    WHEN 'closed' THEN
      _title := 'Ticket Closed';
      _body := _actor_name || ' closed ' || _ticket.ticket_no || ' (' || _ticket.ticket_title || ')';
    WHEN 'reopened' THEN
      _title := 'Ticket Reopened';
      _body := _ticket.ticket_no || ' (' || _ticket.ticket_title || ') has been reopened';
    WHEN 'sla_breached' THEN
      _title := 'SLA Breached';
      _body := _ticket.ticket_no || ' (' || _ticket.ticket_title || ') has breached its SLA';
    ELSE
      _title := 'Ticket Update';
      _body := 'Activity on ' || _ticket.ticket_no || ': ' || NEW.action;
  END CASE;

  -- Notify the requester
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (_ticket.requester_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);

  -- Also notify the assignee if different from actor and requester
  IF _ticket.assignee_id IS NOT NULL 
     AND _ticket.assignee_id != NEW.actor_id 
     AND _ticket.assignee_id != _ticket.requester_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.assignee_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function: notify requester on new comment
CREATE OR REPLACE FUNCTION public.notify_on_ticket_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ticket RECORD;
  _author_name text;
  _body_preview text;
BEGIN
  -- Get ticket info
  SELECT t.id, t.ticket_no, t.title AS ticket_title, t.requester_id, t.assignee_id
  INTO _ticket
  FROM public.tickets t
  WHERE t.id = NEW.ticket_id;

  -- Don't notify if author is the requester (and it's not internal)
  IF NEW.author_id = _ticket.requester_id THEN
    -- Still notify assignee about requester's comment
    IF _ticket.assignee_id IS NOT NULL AND _ticket.assignee_id != NEW.author_id THEN
      SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _author_name
      FROM public.profiles p WHERE p.id = NEW.author_id;
      
      _body_preview := left(NEW.body, 100);
      
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (_ticket.assignee_id, 'ticket_comment', 
              'New Comment on ' || _ticket.ticket_no,
              _author_name || ': ' || _body_preview,
              '/tickets/' || _ticket.id);
    END IF;
    RETURN NEW;
  END IF;

  -- Don't notify requester about internal comments
  IF NEW.is_internal = true THEN
    -- But notify assignee if they're not the author
    IF _ticket.assignee_id IS NOT NULL AND _ticket.assignee_id != NEW.author_id THEN
      SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _author_name
      FROM public.profiles p WHERE p.id = NEW.author_id;
      
      _body_preview := left(NEW.body, 100);
      
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (_ticket.assignee_id, 'ticket_comment',
              'Internal Note on ' || _ticket.ticket_no,
              _author_name || ': ' || _body_preview,
              '/tickets/' || _ticket.id);
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _author_name
  FROM public.profiles p WHERE p.id = NEW.author_id;

  _body_preview := left(NEW.body, 100);

  -- Notify requester
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (_ticket.requester_id, 'ticket_comment',
          'New Comment on ' || _ticket.ticket_no,
          _author_name || ': ' || _body_preview,
          '/tickets/' || _ticket.id);

  -- Notify assignee if different from author and requester
  IF _ticket.assignee_id IS NOT NULL 
     AND _ticket.assignee_id != NEW.author_id 
     AND _ticket.assignee_id != _ticket.requester_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.assignee_id, 'ticket_comment',
            'New Comment on ' || _ticket.ticket_no,
            _author_name || ': ' || _body_preview,
            '/tickets/' || _ticket.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER trg_notify_ticket_activity
  AFTER INSERT ON public.ticket_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_ticket_activity();

CREATE TRIGGER trg_notify_ticket_comment
  AFTER INSERT ON public.ticket_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_ticket_comment();

-- Also need INSERT policy on notifications so the trigger (SECURITY DEFINER) can insert
-- The trigger runs as SECURITY DEFINER so it bypasses RLS, but let's also allow
-- the system to work. The existing policies only allow SELECT and UPDATE by user.
-- Since the trigger is SECURITY DEFINER it already bypasses RLS, so no change needed.
