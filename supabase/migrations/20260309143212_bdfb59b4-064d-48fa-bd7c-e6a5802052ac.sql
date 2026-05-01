
-- Documents table
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  document_type text NOT NULL DEFAULT 'other',
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  issued_by_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  mime_type text,
  description text,
  requires_signature boolean NOT NULL DEFAULT false,
  signature_order_required boolean NOT NULL DEFAULT false,
  due_date date,
  status text NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Document signers table
CREATE TABLE public.document_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  signer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signer_role text DEFAULT 'signer',
  signing_order integer DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  signed_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, signer_user_id)
);

-- Document signatures (actual signature data)
CREATE TABLE public.document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  signer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_id uuid,
  signature_type text NOT NULL DEFAULT 'draw',
  signature_data text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User saved signatures
CREATE TABLE public.user_saved_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signature_type text NOT NULL DEFAULT 'draw',
  signature_data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Document signature fields (placement on document)
CREATE TABLE public.document_signature_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  signer_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  signer_role text,
  field_type text NOT NULL DEFAULT 'signature',
  page_number integer NOT NULL DEFAULT 1,
  x_position numeric NOT NULL DEFAULT 0,
  y_position numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 200,
  height numeric NOT NULL DEFAULT 60,
  required boolean NOT NULL DEFAULT true,
  signing_order integer DEFAULT 1,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signature_fields ENABLE ROW LEVEL SECURITY;

-- Helper function: is People & Culture member
CREATE OR REPLACE FUNCTION public.is_pc_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_members dm
    JOIN public.departments d ON d.id = dm.department_id
    WHERE dm.user_id = _user_id AND d.code = 'PC'
  )
$$;

-- Helper: can manage documents (super_admin or PC member)
CREATE OR REPLACE FUNCTION public.can_manage_documents(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin(_user_id) OR public.is_pc_member(_user_id)
$$;

-- DOCUMENTS policies
CREATE POLICY "Admins can manage all documents" ON public.documents
  FOR ALL TO authenticated
  USING (public.can_manage_documents(auth.uid()))
  WITH CHECK (public.can_manage_documents(auth.uid()));

CREATE POLICY "Recipients can view their documents" ON public.documents
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "Signers can view documents they need to sign" ON public.documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_signers ds
    WHERE ds.document_id = documents.id AND ds.signer_user_id = auth.uid()
  ));

-- DOCUMENT_SIGNERS policies
CREATE POLICY "Admins can manage signers" ON public.document_signers
  FOR ALL TO authenticated
  USING (public.can_manage_documents(auth.uid()))
  WITH CHECK (public.can_manage_documents(auth.uid()));

CREATE POLICY "Signers can view own assignments" ON public.document_signers
  FOR SELECT TO authenticated
  USING (signer_user_id = auth.uid());

CREATE POLICY "Signers can update own status" ON public.document_signers
  FOR UPDATE TO authenticated
  USING (signer_user_id = auth.uid())
  WITH CHECK (signer_user_id = auth.uid());

CREATE POLICY "Recipients can view document signers" ON public.document_signers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_signers.document_id AND d.recipient_user_id = auth.uid()
  ));

-- DOCUMENT_SIGNATURES policies
CREATE POLICY "Admins can manage signatures" ON public.document_signatures
  FOR ALL TO authenticated
  USING (public.can_manage_documents(auth.uid()))
  WITH CHECK (public.can_manage_documents(auth.uid()));

CREATE POLICY "Signers can insert own signatures" ON public.document_signatures
  FOR INSERT TO authenticated
  WITH CHECK (signer_user_id = auth.uid());

CREATE POLICY "Users can view signatures on their docs" ON public.document_signatures
  FOR SELECT TO authenticated
  USING (
    signer_user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_signatures.document_id AND d.recipient_user_id = auth.uid()) OR
    public.can_manage_documents(auth.uid())
  );

-- USER_SAVED_SIGNATURES policies
CREATE POLICY "Users can manage own saved signature" ON public.user_saved_signatures
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DOCUMENT_SIGNATURE_FIELDS policies
CREATE POLICY "Admins can manage signature fields" ON public.document_signature_fields
  FOR ALL TO authenticated
  USING (public.can_manage_documents(auth.uid()))
  WITH CHECK (public.can_manage_documents(auth.uid()));

CREATE POLICY "Signers can view assigned fields" ON public.document_signature_fields
  FOR SELECT TO authenticated
  USING (
    signer_user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_signature_fields.document_id AND d.recipient_user_id = auth.uid())
  );

CREATE POLICY "Signers can update assigned fields" ON public.document_signature_fields
  FOR UPDATE TO authenticated
  USING (signer_user_id = auth.uid())
  WITH CHECK (signer_user_id = auth.uid());

-- Storage bucket for document files
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Storage policies for documents bucket
CREATE POLICY "Admins can upload documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.can_manage_documents(auth.uid()));

CREATE POLICY "Admins can manage document files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'documents' AND public.can_manage_documents(auth.uid()));

CREATE POLICY "Recipients can download their documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents' AND (
      public.can_manage_documents(auth.uid()) OR
      EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.file_url LIKE '%' || name AND (
          d.recipient_user_id = auth.uid() OR
          EXISTS (SELECT 1 FROM public.document_signers ds WHERE ds.document_id = d.id AND ds.signer_user_id = auth.uid())
        )
      )
    )
  );

-- Storage bucket for saved signatures
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', false);

CREATE POLICY "Users can manage own signatures storage" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'signatures' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'signatures' AND (storage.foldername(name))[1] = auth.uid()::text);
