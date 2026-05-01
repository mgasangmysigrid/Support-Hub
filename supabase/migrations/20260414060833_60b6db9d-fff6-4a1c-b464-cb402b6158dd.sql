
DROP FUNCTION IF EXISTS public.get_user_adoption_table(text, uuid);

CREATE OR REPLACE FUNCTION public.get_user_adoption_table(_app text, _dept_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  _14d timestamptz := date_trunc('day', now() - interval '14 days');
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  WITH user_logins AS (
    SELECT user_id,
      MAX(login_at) as last_login,
      COUNT(*)::int as login_count,
      COUNT(DISTINCT login_at::date)::int as login_days
    FROM user_login_events
    WHERE (_app = 'all' OR app_name = _app)
    GROUP BY user_id
  ),
  user_sessions_agg AS (
    SELECT user_id,
      COUNT(*)::int as total_sessions,
      SUM(active_seconds)::int as total_active_seconds
    FROM user_sessions
    WHERE (_app = 'all' OR app_name = _app)
    GROUP BY user_id
  ),
  user_events_agg AS (
    SELECT user_id,
      COUNT(*)::int as total_actions,
      COUNT(DISTINCT module_name)::int as modules_used,
      MAX(occurred_at) as last_active
    FROM user_activity_events
    WHERE (_app = 'all' OR app_name = _app)
    GROUP BY user_id
  ),
  user_depts AS (
    SELECT dm.user_id,
      string_agg(DISTINCT d.name, ', ' ORDER BY d.name) as department_names
    FROM department_members dm
    JOIN departments d ON d.id = dm.department_id
    GROUP BY dm.user_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      p.id as "userId",
      p.full_name as name,
      COALESCE(ud.department_names, '—') as department,
      ul.last_login as "lastLogin",
      COALESCE(ue.last_active, ul.last_login) as "lastActive",
      COALESCE(us.total_sessions, 0) as "totalSessions",
      COALESCE(ue.total_actions, 0) as "totalActions",
      COALESCE(ue.modules_used, 0) as "modulesUsed",
      COALESCE(us.total_active_seconds, 0) as "totalActiveSeconds",
      LEAST(100, (
        GREATEST(0, 30 - COALESCE(EXTRACT(DAY FROM now() - ul.last_login)::int, 999))
        + LEAST(20, COALESCE(us.total_sessions, 0) * 2)
        + LEAST(25, COALESCE(ue.total_actions, 0))
        + LEAST(15, COALESCE(ue.modules_used, 0) * 5)
        + LEAST(10, COALESCE(ul.login_days, 0) * 2)
      )) as "engagementScore",
      CASE
        WHEN ul.last_login IS NULL THEN 'Never Logged In'
        WHEN LEAST(100, (
          GREATEST(0, 30 - COALESCE(EXTRACT(DAY FROM now() - ul.last_login)::int, 999))
          + LEAST(20, COALESCE(us.total_sessions, 0) * 2)
          + LEAST(25, COALESCE(ue.total_actions, 0))
          + LEAST(15, COALESCE(ue.modules_used, 0) * 5)
          + LEAST(10, COALESCE(ul.login_days, 0) * 2)
        )) >= 70 THEN 'Power User'
        WHEN LEAST(100, (
          GREATEST(0, 30 - COALESCE(EXTRACT(DAY FROM now() - ul.last_login)::int, 999))
          + LEAST(20, COALESCE(us.total_sessions, 0) * 2)
          + LEAST(25, COALESCE(ue.total_actions, 0))
          + LEAST(15, COALESCE(ue.modules_used, 0) * 5)
          + LEAST(10, COALESCE(ul.login_days, 0) * 2)
        )) >= 50 THEN 'Healthy Adoption'
        WHEN LEAST(100, (
          GREATEST(0, 30 - COALESCE(EXTRACT(DAY FROM now() - ul.last_login)::int, 999))
          + LEAST(20, COALESCE(us.total_sessions, 0) * 2)
          + LEAST(25, COALESCE(ue.total_actions, 0))
          + LEAST(15, COALESCE(ue.modules_used, 0) * 5)
          + LEAST(10, COALESCE(ul.login_days, 0) * 2)
        )) >= 25 THEN 'Low Adoption'
        WHEN ul.last_login < _14d THEN 'Dormant'
        ELSE 'At Risk'
      END as status
    FROM profiles p
    LEFT JOIN user_depts ud ON ud.user_id = p.id
    LEFT JOIN user_logins ul ON ul.user_id = p.id
    LEFT JOIN user_sessions_agg us ON us.user_id = p.id
    LEFT JOIN user_events_agg ue ON ue.user_id = p.id
    WHERE p.is_active = true
      AND (_dept_id IS NULL OR EXISTS (
        SELECT 1 FROM department_members dm WHERE dm.user_id = p.id AND dm.department_id = _dept_id
      ))
  ) t;

  RETURN result;
END;
$$;
