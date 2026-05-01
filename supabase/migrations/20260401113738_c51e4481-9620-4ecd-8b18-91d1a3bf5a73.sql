
-- Function to count how many @everyone a user has used today
CREATE OR REPLACE FUNCTION public.count_everyone_today(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT count(*)::int FROM bulletin_posts
     WHERE author_user_id = _user_id
       AND mentions_everyone = true
       AND created_at::date = CURRENT_DATE)
    +
    (SELECT count(*)::int FROM bulletin_comments
     WHERE user_id = _user_id
       AND mentions_everyone = true
       AND created_at::date = CURRENT_DATE)
  , 0)
$$;

-- Validation trigger for posts: block if limit exceeded
CREATE OR REPLACE FUNCTION public.validate_everyone_limit_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mentions_everyone = true THEN
    -- On update, if it was already true, don't re-count
    IF TG_OP = 'UPDATE' AND OLD.mentions_everyone = true THEN
      RETURN NEW;
    END IF;
    IF count_everyone_today(NEW.author_user_id) >= 3 THEN
      RAISE EXCEPTION 'EVERYONE_LIMIT_EXCEEDED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_everyone_limit_post
BEFORE INSERT OR UPDATE OF mentions_everyone ON public.bulletin_posts
FOR EACH ROW
EXECUTE FUNCTION public.validate_everyone_limit_post();

-- Validation trigger for comments: block if limit exceeded
CREATE OR REPLACE FUNCTION public.validate_everyone_limit_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mentions_everyone = true THEN
    IF TG_OP = 'UPDATE' AND OLD.mentions_everyone = true THEN
      RETURN NEW;
    END IF;
    IF count_everyone_today(NEW.user_id) >= 3 THEN
      RAISE EXCEPTION 'EVERYONE_LIMIT_EXCEEDED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_everyone_limit_comment
BEFORE INSERT OR UPDATE OF mentions_everyone ON public.bulletin_comments
FOR EACH ROW
EXECUTE FUNCTION public.validate_everyone_limit_comment();
