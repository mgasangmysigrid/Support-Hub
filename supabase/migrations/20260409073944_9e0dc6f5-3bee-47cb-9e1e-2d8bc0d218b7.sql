
-- 1. Unique constraint: one signature per document + signer
ALTER TABLE public.document_signatures
  ADD CONSTRAINT uq_document_signatures_doc_signer
  UNIQUE (document_id, signer_user_id);

-- 2. Partial unique index: one active finalize job per document
CREATE UNIQUE INDEX uq_document_jobs_active_finalize
  ON public.document_jobs (document_id, job_type)
  WHERE status IN ('queued', 'processing');

-- 3. Pipeline audit log table
CREATE TABLE public.document_pipeline_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  job_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_pipeline_logs_document ON public.document_pipeline_logs(document_id);
CREATE INDEX idx_doc_pipeline_logs_event ON public.document_pipeline_logs(event_type);

ALTER TABLE public.document_pipeline_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage pipeline logs"
  ON public.document_pipeline_logs FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Document managers can view pipeline logs"
  ON public.document_pipeline_logs FOR SELECT
  TO authenticated
  USING (public.can_manage_documents(auth.uid()));
