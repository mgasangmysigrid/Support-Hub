
CREATE TABLE public.photo_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.user_photos(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (photo_id, tag)
);

ALTER TABLE public.photo_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read photo hashtags"
  ON public.photo_hashtags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage hashtags on own photos"
  ON public.photo_hashtags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_photos up
      WHERE up.id = photo_hashtags.photo_id AND up.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_photos up
      WHERE up.id = photo_hashtags.photo_id AND up.user_id = auth.uid()
    )
  );

CREATE INDEX idx_photo_hashtags_tag ON public.photo_hashtags (tag);
CREATE INDEX idx_photo_hashtags_photo_id ON public.photo_hashtags (photo_id);
