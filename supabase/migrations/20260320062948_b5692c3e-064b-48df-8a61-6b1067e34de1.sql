
CREATE TABLE public.bulletin_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bulletin_post_id uuid NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, bulletin_post_id)
);

ALTER TABLE public.bulletin_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bulletin reads"
  ON public.bulletin_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own bulletin reads"
  ON public.bulletin_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own bulletin reads"
  ON public.bulletin_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
