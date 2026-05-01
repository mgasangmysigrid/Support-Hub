
CREATE OR REPLACE FUNCTION public.notify_on_ticket_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ticket RECORD;
  _actor_name text;
  _title text;
  _body text;
  _notified_ids uuid[] := ARRAY[]::uuid[];
  _ta RECORD;
BEGIN
  SELECT t.id, t.ticket_no, t.title AS ticket_title, t.requester_id, t.assignee_id
  INTO _ticket
  FROM public.tickets t
  WHERE t.id = NEW.ticket_id;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _actor_name
  FROM public.profiles p WHERE p.id = NEW.actor_id;

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

  -- Notify the requester (unless they are the actor)
  IF NEW.actor_id IS DISTINCT FROM _ticket.requester_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.requester_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
    _notified_ids := array_append(_notified_ids, _ticket.requester_id);
  END IF;

  -- Notify ALL assignees from ticket_assignees (not just primary)
  FOR _ta IN
    SELECT DISTINCT ta.user_id
    FROM public.ticket_assignees ta
    WHERE ta.ticket_id = NEW.ticket_id
    AND ta.user_id IS DISTINCT FROM NEW.actor_id
    AND ta.user_id != ALL(_notified_ids)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ta.user_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
    _notified_ids := array_append(_notified_ids, _ta.user_id);
  END LOOP;

  -- Also notify primary assignee if not already covered
  IF _ticket.assignee_id IS NOT NULL
     AND _ticket.assignee_id IS DISTINCT FROM NEW.actor_id
     AND _ticket.assignee_id != ALL(_notified_ids) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.assignee_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_ticket_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ticket RECORD;
  _author_name text;
  _body_preview text;
  _notified_ids uuid[] := ARRAY[]::uuid[];
  _ta RECORD;
BEGIN
  SELECT t.id, t.ticket_no, t.title AS ticket_title, t.requester_id, t.assignee_id
  INTO _ticket
  FROM public.tickets t
  WHERE t.id = NEW.ticket_id;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _author_name
  FROM public.profiles p WHERE p.id = NEW.author_id;

  _body_preview := left(NEW.body, 100);

  -- Internal comments: only notify assignees, not requester
  IF NEW.is_internal = true THEN
    FOR _ta IN
      SELECT DISTINCT ta.user_id
      FROM public.ticket_assignees ta
      WHERE ta.ticket_id = NEW.ticket_id
      AND ta.user_id IS DISTINCT FROM NEW.author_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (_ta.user_id, 'ticket_comment',
              'Internal Note on ' || _ticket.ticket_no,
              _author_name || ': ' || _body_preview,
              '/tickets/' || _ticket.id);
      _notified_ids := array_append(_notified_ids, _ta.user_id);
    END LOOP;
    -- Also notify primary assignee if not in ticket_assignees
    IF _ticket.assignee_id IS NOT NULL
       AND _ticket.assignee_id IS DISTINCT FROM NEW.author_id
       AND _ticket.assignee_id != ALL(_notified_ids) THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (_ticket.assignee_id, 'ticket_comment',
              'Internal Note on ' || _ticket.ticket_no,
              _author_name || ': ' || _body_preview,
              '/tickets/' || _ticket.id);
    END IF;
    RETURN NEW;
  END IF;

  -- Non-internal comments: notify requester + all assignees

  -- Notify requester (unless they are the author)
  IF NEW.author_id IS DISTINCT FROM _ticket.requester_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.requester_id, 'ticket_comment',
            'New Comment on ' || _ticket.ticket_no,
            _author_name || ': ' || _body_preview,
            '/tickets/' || _ticket.id);
    _notified_ids := array_append(_notified_ids, _ticket.requester_id);
  END IF;

  -- Notify ALL assignees from ticket_assignees
  FOR _ta IN
    SELECT DISTINCT ta.user_id
    FROM public.ticket_assignees ta
    WHERE ta.ticket_id = NEW.ticket_id
    AND ta.user_id IS DISTINCT FROM NEW.author_id
    AND ta.user_id != ALL(_notified_ids)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ta.user_id, 'ticket_comment',
            'New Comment on ' || _ticket.ticket_no,
            _author_name || ': ' || _body_preview,
            '/tickets/' || _ticket.id);
    _notified_ids := array_append(_notified_ids, _ta.user_id);
  END LOOP;

  -- Also notify primary assignee if not already covered
  IF _ticket.assignee_id IS NOT NULL
     AND _ticket.assignee_id IS DISTINCT FROM NEW.author_id
     AND _ticket.assignee_id != ALL(_notified_ids) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.assignee_id, 'ticket_comment',
            'New Comment on ' || _ticket.ticket_no,
            _author_name || ': ' || _body_preview,
            '/tickets/' || _ticket.id);
  END IF;

  RETURN NEW;
END;
$function$;
