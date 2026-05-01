
CREATE OR REPLACE FUNCTION public.reopen_ticket(
  _ticket_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ticket RECORD;
  _new_status text;
  _caller_id uuid := auth.uid();
BEGIN
  -- Fetch ticket
  SELECT id, status, requester_id, reopened_count, closed_at, closed_by,
         final_overdue_seconds, sla_breached_at, closure_confirmation_status,
         closure_confirmed_at, ticket_no
  INTO _ticket
  FROM public.tickets
  WHERE id = _ticket_id;

  IF _ticket.id IS NULL THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  -- Permission: only the original requester can reopen
  IF _caller_id IS NULL OR _caller_id != _ticket.requester_id THEN
    RAISE EXCEPTION 'Only the ticket requester can reopen this ticket';
  END IF;

  -- Validate status: only closed or for_review can be reopened
  IF _ticket.status NOT IN ('closed', 'for_review') THEN
    RAISE EXCEPTION 'Ticket is not in a closable/reviewable state to reopen';
  END IF;

  -- Determine new status
  IF _ticket.status = 'closed' THEN
    _new_status := 'open';
  ELSE
    _new_status := 'in_progress';
  END IF;

  -- Update ticket: reset resolution fields
  UPDATE public.tickets SET
    status = _new_status::status_enum,
    closure_confirmation_status = 'resolved_no',
    closure_confirmed_at = NULL,
    reopened_at = now(),
    reopened_count = COALESCE(_ticket.reopened_count, 0) + 1,
    closed_at = CASE WHEN _ticket.status = 'closed' THEN NULL ELSE closed_at END,
    closed_by = CASE WHEN _ticket.status = 'closed' THEN NULL ELSE closed_by END,
    final_overdue_seconds = CASE WHEN _ticket.status = 'closed' THEN NULL ELSE final_overdue_seconds END,
    sla_breached_at = CASE WHEN _ticket.status = 'closed' THEN NULL ELSE sla_breached_at END
  WHERE id = _ticket_id;

  -- Log reopened comment
  INSERT INTO public.ticket_comments (ticket_id, author_id, body)
  VALUES (_ticket_id, _caller_id, '[Reopened] ' || _reason);

  -- Log activity with full audit payload
  INSERT INTO public.ticket_activity (ticket_id, actor_id, action, from_value, to_value)
  VALUES (
    _ticket_id,
    _caller_id,
    'reopened',
    jsonb_build_object('status', _ticket.status),
    jsonb_build_object('status', _new_status, 'reason', _reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_status', _new_status,
    'ticket_no', _ticket.ticket_no
  );
END;
$$;
