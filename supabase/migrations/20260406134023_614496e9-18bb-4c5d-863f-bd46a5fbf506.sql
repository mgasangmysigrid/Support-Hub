
-- Create scalable function for KB management permission
CREATE OR REPLACE FUNCTION public.can_manage_kb(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_super_admin(_user_id)
    OR is_pc_member(_user_id)
    OR _user_id = '32e61f10-5d29-40a2-adea-1d2894fea6d4'::uuid -- Ivorine Kua
$$;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Super admin can insert knowledge base" ON public.knowledge_base;
DROP POLICY IF EXISTS "Super admin can update knowledge base" ON public.knowledge_base;
DROP POLICY IF EXISTS "Super admin can delete knowledge base" ON public.knowledge_base;

-- Create new policies using can_manage_kb
CREATE POLICY "KB managers can insert knowledge base"
ON public.knowledge_base FOR INSERT
TO authenticated
WITH CHECK (can_manage_kb(auth.uid()));

CREATE POLICY "KB managers can update knowledge base"
ON public.knowledge_base FOR UPDATE
TO authenticated
USING (can_manage_kb(auth.uid()));

CREATE POLICY "KB managers can delete knowledge base"
ON public.knowledge_base FOR DELETE
TO authenticated
USING (can_manage_kb(auth.uid()));
