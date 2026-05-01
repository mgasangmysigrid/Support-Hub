
-- Bulletin board posts table
CREATE TABLE public.bulletin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  audience_label text DEFAULT 'For all MySigrid Employees',
  content_body text NOT NULL,
  author_user_id uuid NOT NULL REFERENCES public.profiles(id),
  external_link text,
  external_link_label text,
  status text NOT NULL DEFAULT 'active',
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bulletin board attachments table
CREATE TABLE public.bulletin_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_post_id uuid NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL DEFAULT 'image',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bulletin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulletin_attachments ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is a bulletin poster
CREATE OR REPLACE FUNCTION public.is_bulletin_poster(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IN (
    'ebcc22a7-86ca-423e-ba47-6c06452c0249'::uuid,
    '32e61f10-5d29-40a2-adea-1d2894fea6d4'::uuid
  )
$$;

-- RLS policies for bulletin_posts
CREATE POLICY "Anyone authenticated can read bulletin posts"
  ON public.bulletin_posts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authorized posters can insert bulletin posts"
  ON public.bulletin_posts FOR INSERT TO authenticated
  WITH CHECK (is_bulletin_poster(auth.uid()) AND author_user_id = auth.uid());

CREATE POLICY "Authorized posters can update bulletin posts"
  ON public.bulletin_posts FOR UPDATE TO authenticated
  USING (is_bulletin_poster(auth.uid()))
  WITH CHECK (is_bulletin_poster(auth.uid()));

CREATE POLICY "Authorized posters can delete bulletin posts"
  ON public.bulletin_posts FOR DELETE TO authenticated
  USING (is_bulletin_poster(auth.uid()));

-- RLS policies for bulletin_attachments
CREATE POLICY "Anyone authenticated can read bulletin attachments"
  ON public.bulletin_attachments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authorized posters can insert bulletin attachments"
  ON public.bulletin_attachments FOR INSERT TO authenticated
  WITH CHECK (is_bulletin_poster(auth.uid()));

CREATE POLICY "Authorized posters can delete bulletin attachments"
  ON public.bulletin_attachments FOR DELETE TO authenticated
  USING (is_bulletin_poster(auth.uid()));

-- Storage bucket for bulletin attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('bulletin-attachments', 'bulletin-attachments', true);

-- Storage RLS policies
CREATE POLICY "Anyone can view bulletin attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bulletin-attachments');

CREATE POLICY "Authorized posters can upload bulletin attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bulletin-attachments' AND public.is_bulletin_poster(auth.uid()));

CREATE POLICY "Authorized posters can delete bulletin attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bulletin-attachments' AND public.is_bulletin_poster(auth.uid()));
