
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
  END IF;

  -- Notify the assignee (unless they are the actor or already notified as requester)
  IF _ticket.assignee_id IS NOT NULL 
     AND _ticket.assignee_id IS DISTINCT FROM NEW.actor_id
     AND _ticket.assignee_id IS DISTINCT FROM _ticket.requester_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.assignee_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
  END IF;

  -- Special case: if actor IS the requester, still notify assignee
  IF NEW.actor_id = _ticket.requester_id
     AND _ticket.assignee_id IS NOT NULL
     AND _ticket.assignee_id != _ticket.requester_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.assignee_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
  END IF;

  RETURN NEW;
END;
$function$;
