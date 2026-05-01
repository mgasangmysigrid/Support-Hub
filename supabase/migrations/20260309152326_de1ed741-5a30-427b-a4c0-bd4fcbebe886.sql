
-- Allow Owners and PC members to delete documents
CREATE POLICY "Admins can delete documents"
  ON public.documents FOR DELETE TO authenticated
  USING (can_manage_documents(auth.uid()));

-- Allow cascading delete of related records
CREATE POLICY "Admins can delete document signers"
  ON public.document_signers FOR DELETE TO authenticated
  USING (can_manage_documents(auth.uid()));

CREATE POLICY "Admins can delete signature fields"
  ON public.document_signature_fields FOR DELETE TO authenticated
  USING (can_manage_documents(auth.uid()));

CREATE POLICY "Admins can delete document signatures"
  ON public.document_signatures FOR DELETE TO authenticated
  USING (can_manage_documents(auth.uid()));
