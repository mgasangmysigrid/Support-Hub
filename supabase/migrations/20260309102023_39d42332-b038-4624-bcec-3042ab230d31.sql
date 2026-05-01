
-- Create user_photos table
CREATE TABLE public.user_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_photos ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view photos
CREATE POLICY "Anyone authenticated can read photos"
  ON public.user_photos FOR SELECT TO authenticated
  USING (true);

-- Users can insert their own photos
CREATE POLICY "Users can insert own photos"
  ON public.user_photos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update own photos (caption)
CREATE POLICY "Users can update own photos"
  ON public.user_photos FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete own photos, super_admin can delete any
CREATE POLICY "Users can delete own photos"
  ON public.user_photos FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_super_admin(auth.uid()));

-- Create photo_reactions table
CREATE TABLE public.photo_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.user_photos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'love', 'celebrate', 'awesome')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (photo_id, user_id)
);

ALTER TABLE public.photo_reactions ENABLE ROW LEVEL SECURITY;

-- Everyone can read reactions
CREATE POLICY "Anyone authenticated can read reactions"
  ON public.photo_reactions FOR SELECT TO authenticated
  USING (true);

-- Users can insert own reactions
CREATE POLICY "Users can insert own reactions"
  ON public.photo_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update own reactions
CREATE POLICY "Users can update own reactions"
  ON public.photo_reactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete own reactions
CREATE POLICY "Users can delete own reactions"
  ON public.photo_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Storage policies for featured-photos bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('featured-photos', 'featured-photos', true);

CREATE POLICY "Anyone can read featured photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'featured-photos');

CREATE POLICY "Users can upload featured photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'featured-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own featured photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'featured-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Super admin can delete any featured photo"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'featured-photos' AND is_super_admin(auth.uid()));
