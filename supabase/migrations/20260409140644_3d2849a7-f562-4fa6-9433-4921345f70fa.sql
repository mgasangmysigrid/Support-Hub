-- Fix storage policies for knowledge-base bucket to use can_manage_kb instead of is_super_admin

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Super admin can upload knowledge base files" ON storage.objects;
DROP POLICY IF EXISTS "Super admin can delete knowledge base files" ON storage.objects;

-- Create new policies using can_manage_kb (which includes super_admin, PC members, and Ivorine Kua)
CREATE POLICY "KB managers can upload knowledge base files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'knowledge-base' AND public.can_manage_kb(auth.uid()));

CREATE POLICY "KB managers can update knowledge base files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'knowledge-base' AND public.can_manage_kb(auth.uid()));

CREATE POLICY "KB managers can delete knowledge base files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'knowledge-base' AND public.can_manage_kb(auth.uid()));