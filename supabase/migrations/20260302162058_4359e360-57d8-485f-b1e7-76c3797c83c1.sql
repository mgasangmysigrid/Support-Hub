
-- 1. Create a trigger function to notify assignees when a new ticket is created
CREATE OR REPLACE FUNCTION public.notify_on_ticket_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _requester_name text;
BEGIN
  -- Only notify if there's an assignee and it's not the requester themselves
  IF NEW.assignee_id IS NULL OR NEW.assignee_id = NEW.requester_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _requester_name
  FROM public.profiles p WHERE p.id = NEW.requester_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.assignee_id,
    'ticket_created',
    'New Ticket: ' || NEW.ticket_no,
    _requester_name || ' raised ticket ' || NEW.ticket_no || ' (' || NEW.title || ')',
    '/tickets/' || NEW.id
  );

  RETURN NEW;
END;
$function$;

-- Create trigger for ticket creation
CREATE TRIGGER trg_notify_on_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_ticket_created();

-- 2. Modify send_notification_email to only send for ticket_created, closed, and mentions
CREATE OR REPLACE FUNCTION public.send_notification_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _supabase_url text;
  _anon_key text;
BEGIN
  -- Only send emails for: ticket created, ticket closed, and @mentions
  IF NEW.type NOT IN ('ticket_created', 'mention') 
     AND NOT (NEW.type = 'ticket_activity' AND NEW.title = 'Ticket Closed') THEN
    RETURN NEW;
  END IF;

  _supabase_url := 'https://ircfcgxtjfamdumxzxzd.supabase.co';
  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyY2ZjZ3h0amZhbWR1bXh6eHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5Mjg4OTAsImV4cCI6MjA4NzUwNDg5MH0.PwmBHWtQaCQN7b8HlkGELAdtk0r3MH-M80DgGKucOuc';

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'link', NEW.link,
      'type', NEW.type
    )
  );

  RETURN NEW;
END;
$function$;
