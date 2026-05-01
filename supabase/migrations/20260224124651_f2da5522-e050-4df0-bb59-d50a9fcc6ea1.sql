
-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'manager', 'employee');
CREATE TYPE public.priority_enum AS ENUM ('normal', 'critical');
CREATE TYPE public.status_enum AS ENUM ('open', 'in_progress', 'blocked', 'for_review', 'closed');
CREATE TYPE public.client_impact_enum AS ENUM ('no', 'potential', 'yes');
CREATE TYPE public.closure_confirm_enum AS ENUM ('pending', 'resolved_yes', 'resolved_no');

-- ==========================================
-- TABLE: user_roles (separate from profiles per security best practice)
-- ==========================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'employee',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: profiles
-- ==========================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: departments
-- ==========================================
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  code text UNIQUE NOT NULL
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: department_members
-- ==========================================
CREATE TABLE public.department_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_manager boolean NOT NULL DEFAULT false,
  is_assignable boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (department_id, user_id)
);
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: dept_sequences
-- ==========================================
CREATE TABLE public.dept_sequences (
  department_id uuid PRIMARY KEY REFERENCES public.departments(id) ON DELETE CASCADE,
  next_number int NOT NULL DEFAULT 1
);
ALTER TABLE public.dept_sequences ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: tickets
-- ==========================================
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  requester_id uuid NOT NULL REFERENCES public.profiles(id),
  department_id uuid NOT NULL REFERENCES public.departments(id),
  priority priority_enum NOT NULL DEFAULT 'normal',
  client_impact client_impact_enum NOT NULL DEFAULT 'no',
  critical_justification text,
  status status_enum NOT NULL DEFAULT 'open',
  assignee_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_activity_at timestamptz DEFAULT now(),
  first_response_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id),
  sla_due_at timestamptz NOT NULL,
  sla_breached_at timestamptz,
  escalated_to_manager_at timestamptz,
  escalated_to_super_admin_at timestamptz,
  closure_confirmation_status closure_confirm_enum NOT NULL DEFAULT 'pending',
  closure_confirmed_at timestamptz,
  reopened_at timestamptz,
  reopened_count int NOT NULL DEFAULT 0
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: ticket_comments
-- ==========================================
CREATE TABLE public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: ticket_activity
-- ==========================================
CREATE TABLE public.ticket_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_value jsonb,
  to_value jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ticket_activity ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: ticket_attachments
-- ==========================================
CREATE TABLE public.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: ticket_survey
-- ==========================================
CREATE TABLE public.ticket_survey (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE UNIQUE,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ticket_survey ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLE: notifications
-- ==========================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- SECURITY DEFINER HELPER FUNCTIONS
-- ==========================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- Check if user is manager of a specific department
CREATE OR REPLACE FUNCTION public.is_dept_manager(_user_id uuid, _dept_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_members
    WHERE user_id = _user_id AND department_id = _dept_id AND is_manager = true
  )
$$;

-- Check if user can access a ticket
CREATE OR REPLACE FUNCTION public.can_access_ticket(_user_id uuid, _ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = _ticket_id
    AND (
      public.is_super_admin(_user_id)
      OR t.requester_id = _user_id
      OR t.assignee_id = _user_id
      OR public.is_dept_manager(_user_id, t.department_id)
    )
  )
$$;

-- ==========================================
-- TRIGGER: Auto-create profile on signup
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  
  -- Default role: employee
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- TRIGGER: Update updated_at on tickets
-- ==========================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ==========================================
-- FUNCTION: Generate ticket number
-- ==========================================
CREATE OR REPLACE FUNCTION public.generate_ticket_no(_dept_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _num int;
BEGIN
  SELECT code INTO _code FROM public.departments WHERE id = _dept_id;
  
  UPDATE public.dept_sequences
  SET next_number = next_number + 1
  WHERE department_id = _dept_id
  RETURNING next_number - 1 INTO _num;
  
  IF _num IS NULL THEN
    INSERT INTO public.dept_sequences (department_id, next_number)
    VALUES (_dept_id, 2);
    _num := 1;
  END IF;
  
  RETURN 'MS-' || _code || '-' || lpad(_num::text, 6, '0');
END;
$$;

-- ==========================================
-- FUNCTION: Auto-assign ticket
-- ==========================================
CREATE OR REPLACE FUNCTION public.auto_assign_ticket(_dept_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assignee_id uuid;
BEGIN
  SELECT dm.user_id INTO _assignee_id
  FROM public.department_members dm
  JOIN public.profiles p ON p.id = dm.user_id
  WHERE dm.department_id = _dept_id
    AND dm.is_assignable = true
    AND p.is_active = true
  ORDER BY (
    SELECT count(*) FROM public.tickets t
    WHERE t.assignee_id = dm.user_id AND t.status != 'closed'
  ) ASC, random()
  LIMIT 1;
  
  RETURN _assignee_id;
END;
$$;

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- user_roles: only super_admin can manage, users can read own
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- profiles
CREATE POLICY "Anyone authenticated can read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- departments
CREATE POLICY "Anyone authenticated can read departments" ON public.departments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin can manage departments" ON public.departments
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- department_members
CREATE POLICY "Anyone authenticated can read dept members" ON public.department_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin can manage dept members" ON public.department_members
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- dept_sequences: only system/super_admin
CREATE POLICY "Super admin can manage sequences" ON public.dept_sequences
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- tickets
CREATE POLICY "Users can create tickets" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can view accessible tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_dept_manager(auth.uid(), department_id)
  );

CREATE POLICY "Managers and admins can update tickets" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_dept_manager(auth.uid(), department_id)
    OR requester_id = auth.uid()
  );

-- ticket_comments
CREATE POLICY "Users can read comments on accessible tickets" ON public.ticket_comments
  FOR SELECT TO authenticated
  USING (public.can_access_ticket(auth.uid(), ticket_id));

CREATE POLICY "Users can add comments on accessible tickets" ON public.ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_ticket(auth.uid(), ticket_id) AND author_id = auth.uid());

-- ticket_activity
CREATE POLICY "Users can read activity on accessible tickets" ON public.ticket_activity
  FOR SELECT TO authenticated
  USING (public.can_access_ticket(auth.uid(), ticket_id));

CREATE POLICY "Users can add activity on accessible tickets" ON public.ticket_activity
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_ticket(auth.uid(), ticket_id));

-- ticket_attachments
CREATE POLICY "Users can read attachments on accessible tickets" ON public.ticket_attachments
  FOR SELECT TO authenticated
  USING (public.can_access_ticket(auth.uid(), ticket_id));

CREATE POLICY "Users can add attachments on accessible tickets" ON public.ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_ticket(auth.uid(), ticket_id) AND uploaded_by = auth.uid());

-- ticket_survey
CREATE POLICY "Requester can create survey" ON public.ticket_survey
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can read survey on accessible tickets" ON public.ticket_survey
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR requester_id = auth.uid()
    OR public.can_access_ticket(auth.uid(), ticket_id)
  );

-- notifications
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ==========================================
-- STORAGE BUCKET
-- ==========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false);

CREATE POLICY "Authenticated users can upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments');

CREATE POLICY "Users can view ticket attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ticket-attachments');

-- ==========================================
-- REALTIME for notifications
-- ==========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
