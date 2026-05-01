-- Table for user-level leave exemptions
CREATE TABLE IF NOT EXISTS public.leave_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_file_pto_anytime boolean NOT NULL DEFAULT false,
  allow_negative_pto_balance boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.leave_exemptions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (needed for submit dialog validation)
CREATE POLICY "Anyone authenticated can read leave exemptions"
  ON public.leave_exemptions FOR SELECT TO authenticated USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage leave exemptions"
  ON public.leave_exemptions FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()) OR is_pc_member(auth.uid()));