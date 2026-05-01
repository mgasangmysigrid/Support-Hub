
-- Add merged_into_id column to tickets
ALTER TABLE public.tickets 
ADD COLUMN merged_into_id uuid REFERENCES public.tickets(id) DEFAULT NULL;

-- Create index for merged lookups
CREATE INDEX idx_tickets_merged_into ON public.tickets(merged_into_id) WHERE merged_into_id IS NOT NULL;

-- Update can_access_ticket to also allow requesters of merged child tickets to access the parent
CREATE OR REPLACE FUNCTION public.can_access_ticket(_user_id uuid, _ticket_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = _ticket_id
    AND (
      public.is_super_admin(_user_id)
      OR t.requester_id = _user_id
      OR t.assignee_id = _user_id
      OR public.is_dept_manager(_user_id, t.department_id)
      -- Allow requesters of child tickets merged into this one
      OR EXISTS (
        SELECT 1 FROM public.tickets child
        WHERE child.merged_into_id = _ticket_id
        AND child.requester_id = _user_id
      )
    )
  )
$function$;

-- Also allow merged ticket requesters to view the parent ticket directly via RLS
-- (the existing SELECT policy already uses can_access_ticket, so it's covered)

-- Allow merged child ticket requesters to post comments on parent
-- (the existing INSERT policy on ticket_comments uses can_access_ticket, so it's covered)

-- Notify all merged requesters when activity happens on parent ticket
CREATE OR REPLACE FUNCTION public.notify_merged_requesters()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _child RECORD;
  _ticket RECORD;
  _actor_name text;
BEGIN
  -- Get parent ticket info
  SELECT t.id, t.ticket_no, t.title AS ticket_title
  INTO _ticket
  FROM public.tickets t
  WHERE t.id = NEW.ticket_id;

  -- Get actor name
  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _actor_name
  FROM public.profiles p WHERE p.id = NEW.actor_id;

  -- Notify requesters of all child tickets merged into this parent
  FOR _child IN
    SELECT DISTINCT c.requester_id
    FROM public.tickets c
    WHERE c.merged_into_id = NEW.ticket_id
    AND c.requester_id != COALESCE(NEW.actor_id, '00000000-0000-0000-0000-000000000000')
    AND c.requester_id != (SELECT requester_id FROM public.tickets WHERE id = NEW.ticket_id)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      _child.requester_id,
      'ticket_activity',
      'Update on Merged Ticket ' || _ticket.ticket_no,
      _actor_name || ' updated ' || _ticket.ticket_no || ' (' || _ticket.ticket_title || '): ' || NEW.action,
      '/tickets/' || _ticket.id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Trigger to notify merged requesters on activity
CREATE TRIGGER notify_merged_requesters_trigger
  AFTER INSERT ON public.ticket_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_merged_requesters();

-- Also notify merged requesters on comments
CREATE OR REPLACE FUNCTION public.notify_merged_requesters_on_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _child RECORD;
  _ticket RECORD;
  _author_name text;
  _body_preview text;
BEGIN
  SELECT t.id, t.ticket_no, t.title AS ticket_title, t.requester_id
  INTO _ticket
  FROM public.tickets t
  WHERE t.id = NEW.ticket_id;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _author_name
  FROM public.profiles p WHERE p.id = NEW.author_id;

  _body_preview := left(NEW.body, 100);

  FOR _child IN
    SELECT DISTINCT c.requester_id
    FROM public.tickets c
    WHERE c.merged_into_id = NEW.ticket_id
    AND c.requester_id != COALESCE(NEW.author_id, '00000000-0000-0000-0000-000000000000')
    AND c.requester_id != _ticket.requester_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      _child.requester_id,
      'ticket_comment',
      'New Comment on Merged Ticket ' || _ticket.ticket_no,
      _author_name || ': ' || _body_preview,
      '/tickets/' || _ticket.id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER notify_merged_requesters_comment_trigger
  AFTER INSERT ON public.ticket_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_merged_requesters_on_comment();
