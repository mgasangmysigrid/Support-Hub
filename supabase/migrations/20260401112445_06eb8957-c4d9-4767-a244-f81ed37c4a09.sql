
-- Add mentions_everyone to posts and comments
ALTER TABLE public.bulletin_posts ADD COLUMN mentions_everyone boolean NOT NULL DEFAULT false;
ALTER TABLE public.bulletin_comments ADD COLUMN mentions_everyone boolean NOT NULL DEFAULT false;

-- Trigger function: notify all active users when @everyone is used in a post
CREATE OR REPLACE FUNCTION public.notify_everyone_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _author_name text;
  _post_title text;
  _uid uuid;
BEGIN
  -- Only fire on insert with mentions_everyone=true, or update changing mentions_everyone to true
  IF NOT NEW.mentions_everyone THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.mentions_everyone = true THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO _author_name FROM profiles WHERE id = NEW.author_user_id;
  _post_title := NEW.title;

  FOR _uid IN
    SELECT id FROM profiles WHERE is_active = true AND id != NEW.author_user_id
  LOOP
    INSERT INTO notifications (user_id, actor_id, type, title, body, link)
    VALUES (
      _uid,
      NEW.author_user_id,
      'bulletin_everyone',
      'MySigrid Updates: ' || _post_title,
      COALESCE(_author_name, 'Someone') || ' mentioned @everyone',
      '/'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_everyone_post
AFTER INSERT OR UPDATE OF mentions_everyone ON public.bulletin_posts
FOR EACH ROW
EXECUTE FUNCTION public.notify_everyone_post();

-- Trigger function: notify all active users when @everyone is used in a comment
CREATE OR REPLACE FUNCTION public.notify_everyone_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _author_name text;
  _post_title text;
  _uid uuid;
BEGIN
  IF NOT NEW.mentions_everyone THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.mentions_everyone = true THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO _author_name FROM profiles WHERE id = NEW.user_id;
  SELECT title INTO _post_title FROM bulletin_posts WHERE id = NEW.bulletin_post_id;

  FOR _uid IN
    SELECT id FROM profiles WHERE is_active = true AND id != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, actor_id, type, title, body, link)
    VALUES (
      _uid,
      NEW.user_id,
      'bulletin_everyone',
      'MySigrid Updates: ' || COALESCE(_post_title, 'Post'),
      COALESCE(_author_name, 'Someone') || ' mentioned @everyone in a comment',
      '/'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_everyone_comment
AFTER INSERT OR UPDATE OF mentions_everyone ON public.bulletin_comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_everyone_comment();
