
-- Create photo_comments table
CREATE TABLE public.photo_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.user_photos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.photo_comments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read comments
CREATE POLICY "Anyone authenticated can read photo comments"
  ON public.photo_comments FOR SELECT TO authenticated
  USING (true);

-- Users can insert own comments
CREATE POLICY "Users can insert own photo comments"
  ON public.photo_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete own comments
CREATE POLICY "Users can delete own photo comments"
  ON public.photo_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Super admin can delete any comment
CREATE POLICY "Super admin can delete photo comments"
  ON public.photo_comments FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));
