
-- RPC: get_adoption_kpis
CREATE OR REPLACE FUNCTION public.get_adoption_kpis(
  _app text DEFAULT 'all',
  _dept_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  _today timestamptz := date_trunc('day', now());
  _7d timestamptz := date_trunc('day', now() - interval '7 days');
  _30d timestamptz := date_trunc('day', now() - interval '30 days');
  _14d timestamptz := date_trunc('day', now() - interval '14 days');
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  WITH filtered_profiles AS (
    SELECT p.id as user_id FROM profiles p
    WHERE p.is_active = true
      AND (_dept_id IS NULL OR EXISTS (
        SELECT 1 FROM department_members dm WHERE dm.user_id = p.id AND dm.department_id = _dept_id
      ))
  ),
  filtered_logins AS (
    SELECT DISTINCT ON (le.user_id, date_trunc('day', le.login_at))
      le.user_id, le.login_at
    FROM user_login_events le
    JOIN filtered_profiles fp ON fp.user_id = le.user_id
    WHERE (_app = 'all' OR le.app_name = _app)
  ),
  user_last_login AS (
    SELECT user_id, MAX(login_at) as last_login
    FROM filtered_logins GROUP BY user_id
  )
  SELECT jsonb_build_object(
    'activeToday', (SELECT COUNT(DISTINCT user_id) FROM filtered_logins WHERE login_at >= _today),
    'active7d', (SELECT COUNT(DISTINCT user_id) FROM filtered_logins WHERE login_at >= _7d),
    'active30d', (SELECT COUNT(DISTINCT user_id) FROM filtered_logins WHERE login_at >= _30d),
    'neverLoggedIn', (
      SELECT COUNT(*) FROM filtered_profiles fp
      WHERE NOT EXISTS (SELECT 1 FROM user_last_login ull WHERE ull.user_id = fp.user_id)
    ),
    'dormant', (
      SELECT COUNT(*) FROM user_last_login WHERE last_login < _14d
    ),
    'totalUsers', (SELECT COUNT(*) FROM filtered_profiles)
  ) INTO result;

  RETURN result;
END;
$$;

-- RPC: get_login_trend
CREATE OR REPLACE FUNCTION public.get_login_trend(
  _from timestamptz,
  _to timestamptz,
  _app text DEFAULT 'all',
  _dept_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.d), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      d::date as date,
      COUNT(DISTINCT le.user_id) as "activeUsers",
      COUNT(DISTINCT CASE WHEN le.app_name = 'support_hub' THEN le.user_id END) as "supportHub"
    FROM generate_series(_from::date, _to::date, '1 day') d
    LEFT JOIN user_login_events le
      ON le.login_at::date = d::date
      AND (_app = 'all' OR le.app_name = _app)
      AND (_dept_id IS NULL OR le.user_id IN (
        SELECT dm.user_id FROM department_members dm WHERE dm.department_id = _dept_id
      ))
    GROUP BY d
  ) t;

  RETURN result;
END;
$$;

-- RPC: get_module_usage
CREATE OR REPLACE FUNCTION public.get_module_usage(
  _from timestamptz,
  _to timestamptz,
  _app text DEFAULT 'all',
  _dept_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t."uniqueUsers" DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      ae.module_name as module,
      COUNT(DISTINCT ae.user_id) as "uniqueUsers"
    FROM user_activity_events ae
    WHERE ae.occurred_at >= _from AND ae.occurred_at <= _to
      AND (_app = 'all' OR ae.app_name = _app)
      AND (_dept_id IS NULL OR ae.user_id IN (
        SELECT dm.user_id FROM department_members dm WHERE dm.department_id = _dept_id
      ))
    GROUP BY ae.module_name
  ) t;

  RETURN result;
END;
$$;

-- RPC: get_dept_adoption
CREATE OR REPLACE FUNCTION public.get_dept_adoption()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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

  WITH user_last AS (
    SELECT user_id, MAX(login_at) as last_login FROM user_login_events GROUP BY user_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      COALESCE(d.name, 'Unassigned') as name,
      COUNT(DISTINCT p.id)::int as total,
      COUNT(DISTINCT CASE WHEN ul.last_login >= _14d THEN p.id END)::int as active,
      COUNT(DISTINCT CASE WHEN ul.last_login IS NULL THEN p.id END)::int as "neverLoggedIn"
    FROM profiles p
    LEFT JOIN department_members dm ON dm.user_id = p.id
    LEFT JOIN departments d ON d.id = dm.department_id
    LEFT JOIN user_last ul ON ul.user_id = p.id
    WHERE p.is_active = true
    GROUP BY COALESCE(d.name, 'Unassigned')
  ) t;

  RETURN result;
END;
$$;

-- RPC: get_user_adoption_table
CREATE OR REPLACE FUNCTION public.get_user_adoption_table(
  _app text DEFAULT 'all',
  _dept_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      p.id as "userId",
      p.full_name as name,
      COALESCE(d.name, '—') as department,
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
    LEFT JOIN department_members dm ON dm.user_id = p.id
    LEFT JOIN departments d ON d.id = dm.department_id
    LEFT JOIN user_logins ul ON ul.user_id = p.id
    LEFT JOIN user_sessions_agg us ON us.user_id = p.id
    LEFT JOIN user_events_agg ue ON ue.user_id = p.id
    WHERE p.is_active = true
      AND (_dept_id IS NULL OR dm.department_id = _dept_id)
  ) t;

  RETURN result;
END;
$$;

-- RPC: get_adoption_alerts
CREATE OR REPLACE FUNCTION public.get_adoption_alerts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alerts jsonb := '[]'::jsonb;
  _7d timestamptz := now() - interval '7 days';
  _14d timestamptz := now() - interval '14 days';
  _this_week_start timestamptz := date_trunc('week', now());
  _last_week_start timestamptz := date_trunc('week', now() - interval '7 days');
  _last_week_end timestamptz := date_trunc('week', now());
  _count int;
  _this_week_count int;
  _last_week_count int;
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Never logged in
  SELECT COUNT(*) INTO _count FROM profiles p
  WHERE p.is_active = true
    AND NOT EXISTS (SELECT 1 FROM user_login_events le WHERE le.user_id = p.id);
  IF _count > 0 THEN
    alerts := alerts || jsonb_build_object('type', 'never_logged_in', 'severity', 'critical',
      'message', _count || ' user(s) have never logged in', 'count', _count);
  END IF;

  -- Dormant 14+ days
  WITH user_last AS (
    SELECT user_id, MAX(login_at) as ll FROM user_login_events GROUP BY user_id
  )
  SELECT COUNT(*) INTO _count FROM user_last WHERE ll < _14d;
  IF _count > 0 THEN
    alerts := alerts || jsonb_build_object('type', 'dormant', 'severity', 'warning',
      'message', _count || ' user(s) inactive for 14+ days', 'count', _count);
  END IF;

  -- Login but no meaningful actions
  WITH recent_logins AS (
    SELECT DISTINCT user_id FROM user_login_events WHERE login_at >= _7d
  )
  SELECT COUNT(*) INTO _count FROM recent_logins rl
  WHERE NOT EXISTS (SELECT 1 FROM user_activity_events ae WHERE ae.user_id = rl.user_id);
  IF _count > 0 THEN
    alerts := alerts || jsonb_build_object('type', 'login_no_action', 'severity', 'warning',
      'message', _count || ' user(s) logged in recently but performed no actions', 'count', _count);
  END IF;

  -- Departments with < 50% adoption
  WITH dept_stats AS (
    SELECT dm.department_id, d.name as dept_name,
      COUNT(DISTINCT dm.user_id) as total,
      COUNT(DISTINCT CASE WHEN EXISTS (
        SELECT 1 FROM user_login_events le WHERE le.user_id = dm.user_id AND le.login_at >= _14d
      ) THEN dm.user_id END) as active
    FROM department_members dm
    JOIN departments d ON d.id = dm.department_id
    JOIN profiles p ON p.id = dm.user_id AND p.is_active = true
    GROUP BY dm.department_id, d.name
    HAVING COUNT(DISTINCT dm.user_id) >= 2
  )
  SELECT COUNT(*) INTO _count FROM dept_stats WHERE active::float / total < 0.5;
  IF _count > 0 THEN
    alerts := alerts || jsonb_build_object('type', 'low_dept_adoption', 'severity', 'warning',
      'message', _count || ' department(s) have less than 50% adoption', 'count', _count);
  END IF;

  -- Week-over-week drop
  SELECT COUNT(DISTINCT user_id) INTO _this_week_count
  FROM user_login_events WHERE login_at >= _this_week_start;
  SELECT COUNT(DISTINCT user_id) INTO _last_week_count
  FROM user_login_events WHERE login_at >= _last_week_start AND login_at < _last_week_end;
  IF _last_week_count > 3 AND _this_week_count < _last_week_count * 0.6 THEN
    alerts := alerts || jsonb_build_object('type', 'wow_drop', 'severity', 'critical',
      'message', 'Significant drop in weekly active users: ' || _last_week_count || ' → ' || _this_week_count, 'count', 0);
  END IF;

  RETURN alerts;
END;
$$;
