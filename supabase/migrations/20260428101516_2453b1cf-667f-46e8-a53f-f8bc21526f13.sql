-- 1. Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pushover_user_key text,
  ADD COLUMN IF NOT EXISTS pushover_enabled boolean NOT NULL DEFAULT true;

-- 2. Lock down direct column access (key column)
REVOKE SELECT (pushover_user_key) ON public.profiles FROM authenticated, anon;
REVOKE UPDATE (pushover_user_key) ON public.profiles FROM authenticated, anon;

-- 3. Permission helper
CREATE OR REPLACE FUNCTION public.can_manage_pushover_for(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.department_members mgr
      JOIN public.department_members emp ON emp.department_id = mgr.department_id
      WHERE mgr.user_id = auth.uid()
        AND mgr.is_manager = true
        AND emp.user_id = _target_user_id
    );
$$;

-- 4. List RPC: returns users the caller may manage, with their Pushover status
CREATE OR REPLACE FUNCTION public.admin_list_pushover_status()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  departments text[],
  pushover_user_key text,
  pushover_enabled boolean,
  has_key boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_super_admin(auth.uid()) OR public.is_any_dept_manager(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.full_name,
    p.email,
    COALESCE(
      (SELECT array_agg(d.name ORDER BY d.name)
         FROM public.department_members dm
         JOIN public.departments d ON d.id = dm.department_id
        WHERE dm.user_id = p.id),
      ARRAY[]::text[]
    ) AS departments,
    p.pushover_user_key,
    p.pushover_enabled,
    (p.pushover_user_key IS NOT NULL AND length(trim(p.pushover_user_key)) > 0) AS has_key
  FROM public.profiles p
  WHERE p.is_active = true
    AND public.can_manage_pushover_for(p.id)
  ORDER BY p.full_name NULLS LAST, p.email;
END;
$$;

-- 5. Set RPC: update key + enabled flag
CREATE OR REPLACE FUNCTION public.admin_set_pushover_key(
  _target_user_id uuid,
  _user_key text,
  _enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_manage_pushover_for(_target_user_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage this user';
  END IF;

  _clean_key := NULLIF(trim(COALESCE(_user_key, '')), '');

  UPDATE public.profiles
     SET pushover_user_key = _clean_key,
         pushover_enabled = COALESCE(_enabled, true)
   WHERE id = _target_user_id;
END;
$$;

-- 6. Trigger function: fire push for critical tickets
CREATE OR REPLACE FUNCTION public.notify_pushover_critical_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text;
  _anon_key text;
BEGIN
  IF NEW.priority IS DISTINCT FROM 'critical' THEN
    RETURN NEW;
  END IF;
  IF NEW.primary_assignee_id IS NULL THEN
    RETURN NEW;
  END IF;

  _supabase_url := 'https://ircfcgxtjfamdumxzxzd.supabase.co';
  _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyY2ZjZ3h0amZhbWR1bXh6eHpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5Mjg4OTAsImV4cCI6MjA4NzUwNDg5MH0.PwmBHWtQaCQN7b8HlkGELAdtk0r3MH-M80DgGKucOuc';

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/send-pushover-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.primary_assignee_id,
      'title', '🚨 Critical Ticket: ' || NEW.ticket_no,
      'body', NEW.title,
      'link', '/tickets/' || NEW.id,
      'priority', 'critical'
    )
  );

  RETURN NEW;
END;
$$;

-- 7. Trigger
DROP TRIGGER IF EXISTS trg_pushover_critical_ticket ON public.tickets;
CREATE TRIGGER trg_pushover_critical_ticket
AFTER INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_pushover_critical_ticket();