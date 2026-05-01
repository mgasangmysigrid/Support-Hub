
-- 1. Update comment notification trigger to avoid double-notifying mentioned users
CREATE OR REPLACE FUNCTION public.notify_on_bulletin_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _post RECORD;
  _commenter_name text;
  _body_preview text;
BEGIN
  -- Only fire on INSERT
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

  SELECT bp.id, bp.title, bp.author_user_id
  INTO _post FROM public.bulletin_posts bp WHERE bp.id = NEW.bulletin_post_id;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _commenter_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  _body_preview := left(NEW.body, 100);

  -- Notify post author if commenter is not the author
  -- AND author is not @mentioned in this comment (they'll get a mention notification instead)
  IF NEW.user_id IS DISTINCT FROM _post.author_user_id THEN
    -- Check if author will also get a mention notification from this comment
    -- If body contains a mention of the author, skip to avoid duplicate
    IF position('@[' in NEW.body) = 0 
       OR position('(' || _post.author_user_id || ')' in NEW.body) = 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        _post.author_user_id,
        'bulletin_comment',
        'Comment on "' || left(_post.title, 50) || '"',
        _commenter_name || ': ' || _body_preview,
        '/?bulletin=' || _post.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Add cascade delete for comment mentions when a comment is deleted
ALTER TABLE public.bulletin_comment_mentions
  DROP CONSTRAINT IF EXISTS bulletin_comment_mentions_comment_id_fkey;
ALTER TABLE public.bulletin_comment_mentions
  ADD CONSTRAINT bulletin_comment_mentions_comment_id_fkey
  FOREIGN KEY (comment_id) REFERENCES public.bulletin_comments(id) ON DELETE CASCADE;

-- 3. Add cascade delete for bulletin mentions when a post is deleted  
ALTER TABLE public.bulletin_mentions
  DROP CONSTRAINT IF EXISTS bulletin_mentions_bulletin_post_id_fkey;
ALTER TABLE public.bulletin_mentions
  ADD CONSTRAINT bulletin_mentions_bulletin_post_id_fkey
  FOREIGN KEY (bulletin_post_id) REFERENCES public.bulletin_posts(id) ON DELETE CASCADE;

-- 4. Add DELETE policy for bulletin_comment_mentions (needed for mention lifecycle on edit)
CREATE POLICY "Comment authors can delete their comment mentions"
ON public.bulletin_comment_mentions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bulletin_comments bc
    WHERE bc.id = bulletin_comment_mentions.comment_id AND bc.user_id = auth.uid()
  )
);
