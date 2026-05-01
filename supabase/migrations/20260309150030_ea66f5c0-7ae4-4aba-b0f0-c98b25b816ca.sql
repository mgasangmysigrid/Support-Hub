
-- Create security definer functions to break the recursion cycle
CREATE OR REPLACE FUNCTION public.is_document_recipient(_user_id uuid, _document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents
    WHERE id = _document_id AND recipient_user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_document_signer(_user_id uuid, _document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.document_signers
    WHERE document_id = _document_id AND signer_user_id = _user_id
  )
$$;

-- Drop and recreate the problematic policies on documents
DROP POLICY IF EXISTS "Signers can view documents they need to sign" ON public.documents;
CREATE POLICY "Signers can view documents they need to sign"
  ON public.documents FOR SELECT TO authenticated
  USING (public.is_document_signer(auth.uid(), id));

-- Drop and recreate the problematic policies on document_signers
DROP POLICY IF EXISTS "Recipients can view document signers" ON public.document_signers;
CREATE POLICY "Recipients can view document signers"
  ON public.document_signers FOR SELECT TO authenticated
  USING (public.is_document_recipient(auth.uid(), document_id));

-- Fix document_signature_fields policy that also cross-references documents
DROP POLICY IF EXISTS "Signers can view assigned fields" ON public.document_signature_fields;
CREATE POLICY "Signers can view assigned fields"
  ON public.document_signature_fields FOR SELECT TO authenticated
  USING (signer_user_id = auth.uid() OR public.is_document_recipient(auth.uid(), document_id));

-- Fix document_signatures policy
DROP POLICY IF EXISTS "Users can view signatures on their docs" ON public.document_signatures;
CREATE POLICY "Users can view signatures on their docs"
  ON public.document_signatures FOR SELECT TO authenticated
  USING (signer_user_id = auth.uid() OR public.is_document_recipient(auth.uid(), document_id) OR can_manage_documents(auth.uid()));
