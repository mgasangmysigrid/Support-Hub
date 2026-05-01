
-- Bulletin reactions: one reaction per user per post
CREATE TABLE public.bulletin_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_post_id uuid NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bulletin_post_id, user_id)
);

ALTER TABLE public.bulletin_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read bulletin reactions"
  ON public.bulletin_reactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own reactions"
  ON public.bulletin_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own reactions"
  ON public.bulletin_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own reactions"
  ON public.bulletin_reactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Bulletin comments
CREATE TABLE public.bulletin_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_post_id uuid NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulletin_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read bulletin comments"
  ON public.bulletin_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own comments"
  ON public.bulletin_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own comments"
  ON public.bulletin_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
  ON public.bulletin_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can delete any comment"
  ON public.bulletin_comments FOR DELETE TO authenticated
  USING (is_bulletin_poster(auth.uid()));

-- Bulletin post mentions
CREATE TABLE public.bulletin_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_post_id uuid NOT NULL REFERENCES public.bulletin_posts(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bulletin_post_id, mentioned_user_id)
);

ALTER TABLE public.bulletin_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read bulletin mentions"
  ON public.bulletin_mentions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized posters can manage mentions"
  ON public.bulletin_mentions FOR ALL TO authenticated
  USING (is_bulletin_poster(auth.uid()))
  WITH CHECK (is_bulletin_poster(auth.uid()));

-- Bulletin comment mentions
CREATE TABLE public.bulletin_comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.bulletin_comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id, mentioned_user_id)
);

ALTER TABLE public.bulletin_comment_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read comment mentions"
  ON public.bulletin_comment_mentions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert comment mentions"
  ON public.bulletin_comment_mentions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bulletin_comments bc
    WHERE bc.id = comment_id AND bc.user_id = auth.uid()
  ));

-- Notification triggers

-- Notify when someone comments on a bulletin post
CREATE OR REPLACE FUNCTION public.notify_on_bulletin_comment()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _post RECORD;
  _commenter_name text;
  _body_preview text;
BEGIN
  SELECT bp.id, bp.title, bp.author_user_id
  INTO _post FROM public.bulletin_posts bp WHERE bp.id = NEW.bulletin_post_id;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _commenter_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  _body_preview := left(NEW.body, 100);

  -- Notify post author if commenter is not the author
  IF NEW.user_id IS DISTINCT FROM _post.author_user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      _post.author_user_id,
      'bulletin_comment',
      'Comment on "' || left(_post.title, 50) || '"',
      _commenter_name || ': ' || _body_preview,
      '/?bulletin=' || _post.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_bulletin_comment
  AFTER INSERT ON public.bulletin_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_bulletin_comment();

-- Notify when someone is mentioned in a bulletin comment
CREATE OR REPLACE FUNCTION public.notify_on_bulletin_comment_mention()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _comment RECORD;
  _post RECORD;
  _mentioner_name text;
BEGIN
  SELECT bc.user_id, bc.body, bc.bulletin_post_id
  INTO _comment FROM public.bulletin_comments bc WHERE bc.id = NEW.comment_id;

  SELECT bp.title INTO _post FROM public.bulletin_posts bp WHERE bp.id = _comment.bulletin_post_id;

  -- Don't notify if user mentions themselves
  IF NEW.mentioned_user_id = _comment.user_id THEN RETURN NEW; END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _mentioner_name
  FROM public.profiles p WHERE p.id = _comment.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
  VALUES (
    NEW.mentioned_user_id,
    'bulletin_mention',
    'You were mentioned in a comment',
    _mentioner_name || ' mentioned you in a comment on "' || left(_post.title, 50) || '"',
    '/?bulletin=' || _comment.bulletin_post_id,
    _comment.user_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_bulletin_comment_mention
  AFTER INSERT ON public.bulletin_comment_mentions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_bulletin_comment_mention();

-- Notify when someone is mentioned in a bulletin post
CREATE OR REPLACE FUNCTION public.notify_on_bulletin_post_mention()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _post RECORD;
  _author_name text;
BEGIN
  SELECT bp.title, bp.author_user_id
  INTO _post FROM public.bulletin_posts bp WHERE bp.id = NEW.bulletin_post_id;

  IF NEW.mentioned_user_id = _post.author_user_id THEN RETURN NEW; END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _author_name
  FROM public.profiles p WHERE p.id = _post.author_user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
  VALUES (
    NEW.mentioned_user_id,
    'bulletin_mention',
    'You were mentioned in an update',
    _author_name || ' mentioned you in "' || left(_post.title, 50) || '"',
    '/?bulletin=' || NEW.bulletin_post_id,
    _post.author_user_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_bulletin_post_mention
  AFTER INSERT ON public.bulletin_mentions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_bulletin_post_mention();
