
-- Add processing state columns to documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS processing_state text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS finalization_error text,
  ADD COLUMN IF NOT EXISTS finalization_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

-- Create document_jobs table
CREATE TABLE public.document_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'finalize_document',
  status text NOT NULL DEFAULT 'queued',
  attempt_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_jobs_status ON public.document_jobs(status) WHERE status IN ('queued', 'processing');
CREATE INDEX idx_document_jobs_document_id ON public.document_jobs(document_id);

-- RLS
ALTER TABLE public.document_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage document jobs"
  ON public.document_jobs FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Document managers can view jobs"
  ON public.document_jobs FOR SELECT
  TO authenticated
  USING (public.can_manage_documents(auth.uid()));
