
-- Index on visibility_type for filtering
CREATE INDEX IF NOT EXISTS idx_kb_visibility_type ON public.knowledge_base (visibility_type);

-- Individual indexes on junction table columns (unique constraint covers composite)
CREATE INDEX IF NOT EXISTS idx_kbd_knowledge_base_id ON public.knowledge_base_departments (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_kbd_department_id ON public.knowledge_base_departments (department_id);

-- Harden acknowledgment INSERT: user must be allowed to view the document
DROP POLICY IF EXISTS "Users can insert own acknowledgments" ON public.company_document_acknowledgments;
CREATE POLICY "Users can insert own acknowledgments"
ON public.company_document_acknowledgments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_view_kb_doc(auth.uid(), document_id)
);

-- Allow KB managers to read all acknowledgments (for reporting)
DROP POLICY IF EXISTS "Admins can read all acknowledgments" ON public.company_document_acknowledgments;
CREATE POLICY "KB managers can read all acknowledgments"
ON public.company_document_acknowledgments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_kb(auth.uid())
);

-- Drop the now-redundant user read policy (merged above)
DROP POLICY IF EXISTS "Users can read own acknowledgments" ON public.company_document_acknowledgments;
