
-- Login events table
CREATE TABLE public.user_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_name text NOT NULL DEFAULT 'support_hub',
  session_id uuid,
  user_agent text,
  ip_address text,
  login_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_select_login_events" ON public.user_login_events
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "authenticated_insert_login_events" ON public.user_login_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_login_events_user_id ON public.user_login_events(user_id);
CREATE INDEX idx_login_events_app_name ON public.user_login_events(app_name);
CREATE INDEX idx_login_events_login_at ON public.user_login_events(login_at);

-- Sessions table
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_name text NOT NULL DEFAULT 'support_hub',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  active_seconds integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_select_sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "authenticated_insert_sessions" ON public.user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_update_own_sessions" ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_sessions_app_name ON public.user_sessions(app_name);
CREATE INDEX idx_sessions_started_at ON public.user_sessions(started_at);
CREATE INDEX idx_sessions_is_active ON public.user_sessions(is_active);

-- Activity events table
CREATE TABLE public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_name text NOT NULL DEFAULT 'support_hub',
  session_id uuid,
  module_name text NOT NULL,
  event_name text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_select_activity_events" ON public.user_activity_events
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "authenticated_insert_activity_events" ON public.user_activity_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_activity_events_user_id ON public.user_activity_events(user_id);
CREATE INDEX idx_activity_events_app_name ON public.user_activity_events(app_name);
CREATE INDEX idx_activity_events_occurred_at ON public.user_activity_events(occurred_at);
CREATE INDEX idx_activity_events_module ON public.user_activity_events(module_name);
CREATE INDEX idx_activity_events_event ON public.user_activity_events(event_name);
