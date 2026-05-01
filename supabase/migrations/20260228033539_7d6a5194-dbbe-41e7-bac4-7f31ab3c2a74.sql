
-- Enable the pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to call the edge function when a notification is inserted
CREATE OR REPLACE FUNCTION public.send_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supabase_url text;
  _anon_key text;
BEGIN
  -- Get config from vault or use known values
  _supabase_url := 'https://ircfcgxtjfamdumxzxzd.supabase.co';
  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyY2ZjZ3h0amZhbWR1bXh6eHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5Mjg4OTAsImV4cCI6MjA4NzUwNDg5MH0.PwmBHWtQaCQN7b8HlkGELAdtk0r3MH-M80DgGKucOuc';

  -- Fire-and-forget HTTP POST to edge function
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
$$;

-- Create the trigger on notifications table
CREATE TRIGGER trg_send_notification_email
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_notification_email();
