
-- Add acknowledgment-related columns to knowledge_base
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS requires_acknowledgment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_policy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS acknowledgment_required_from timestamptz;

-- Create acknowledgment tracking table
CREATE TABLE public.company_document_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_version integer NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, user_id, document_version)
);

-- RLS
ALTER TABLE public.company_document_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Employees can read their own acknowledgments
CREATE POLICY "Users can read own acknowledgments"
  ON public.company_document_acknowledgments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Employees can insert their own acknowledgments
CREATE POLICY "Users can insert own acknowledgments"
  ON public.company_document_acknowledgments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Owner (super_admin) can read all acknowledgments
CREATE POLICY "Admins can read all acknowledgments"
  ON public.company_document_acknowledgments FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Index for fast lookups
CREATE INDEX idx_cda_document_user ON public.company_document_acknowledgments(document_id, user_id, document_version);
CREATE INDEX idx_cda_user ON public.company_document_acknowledgments(user_id);

-- Mark all existing knowledge_base documents as requiring acknowledgment
UPDATE public.knowledge_base SET requires_acknowledgment = true, is_policy = true WHERE is_archived = false;
