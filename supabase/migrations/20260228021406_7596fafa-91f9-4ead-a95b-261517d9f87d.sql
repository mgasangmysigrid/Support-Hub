
-- Knowledge base documents table
CREATE TABLE public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  content text, -- rich text / typed content
  file_path text, -- storage path for PDF
  file_name text, -- original file name
  created_by uuid REFERENCES public.profiles(id) NOT NULL,
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "All authenticated users can read knowledge base"
  ON public.knowledge_base FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admin can insert
CREATE POLICY "Super admin can insert knowledge base"
  ON public.knowledge_base FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

-- Only super_admin can update
CREATE POLICY "Super admin can update knowledge base"
  ON public.knowledge_base FOR UPDATE
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- Only super_admin can delete
CREATE POLICY "Super admin can delete knowledge base"
  ON public.knowledge_base FOR DELETE
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- Storage bucket for knowledge base PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-base', 'knowledge-base', true);

-- Storage RLS: anyone authenticated can read
CREATE POLICY "Authenticated users can read knowledge base files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'knowledge-base');

-- Storage RLS: only super_admin can upload
CREATE POLICY "Super admin can upload knowledge base files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'knowledge-base' AND public.is_super_admin(auth.uid()));

-- Storage RLS: only super_admin can delete
CREATE POLICY "Super admin can delete knowledge base files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'knowledge-base' AND public.is_super_admin(auth.uid()));
