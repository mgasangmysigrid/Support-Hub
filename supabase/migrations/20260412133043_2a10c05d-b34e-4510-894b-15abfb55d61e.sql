
-- Add visibility_type to knowledge_base
ALTER TABLE public.knowledge_base
ADD COLUMN visibility_type text NOT NULL DEFAULT 'all';

-- Create junction table
CREATE TABLE public.knowledge_base_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(knowledge_base_id, department_id)
);

-- Enable RLS
ALTER TABLE public.knowledge_base_departments ENABLE ROW LEVEL SECURITY;

-- KB managers can do everything with department links
CREATE POLICY "KB managers can manage department links"
ON public.knowledge_base_departments
FOR ALL
TO authenticated
USING (public.can_manage_kb(auth.uid()))
WITH CHECK (public.can_manage_kb(auth.uid()));

-- All authenticated users can read department links (needed for filtering)
CREATE POLICY "Authenticated users can read department links"
ON public.knowledge_base_departments
FOR SELECT
TO authenticated
USING (true);

-- Create a function to check if a user can view a KB document based on visibility
CREATE OR REPLACE FUNCTION public.can_view_kb_doc(_user_id uuid, _doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_kb(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.knowledge_base kb
      WHERE kb.id = _doc_id
      AND (
        kb.visibility_type = 'all'
        OR EXISTS (
          SELECT 1 FROM public.knowledge_base_departments kbd
          JOIN public.department_members dm ON dm.department_id = kbd.department_id
          WHERE kbd.knowledge_base_id = kb.id
          AND dm.user_id = _user_id
        )
      )
    )
$$;
