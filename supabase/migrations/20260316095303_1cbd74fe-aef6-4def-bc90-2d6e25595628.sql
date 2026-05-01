
-- Add actor_id to notifications for showing profile photos
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id);

-- Update notify_on_new_photo: use Home deep-link, set actor_id, group notifications
CREATE OR REPLACE FUNCTION public.notify_on_new_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _author_name text;
  _target RECORD;
  _recent_id uuid;
BEGIN
  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _author_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  FOR _target IN
    SELECT pr.id FROM public.profiles pr
    WHERE pr.is_active = true AND pr.id != NEW.user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = pr.id AND np.photo_new = false
    )
  LOOP
    SELECT n.id INTO _recent_id
    FROM public.notifications n
    WHERE n.user_id = _target.id
      AND n.type = 'featured_photo_created'
      AND n.created_at > now() - interval '5 minutes'
      AND n.is_read = false
    ORDER BY n.created_at DESC
    LIMIT 1;

    IF _recent_id IS NOT NULL THEN
      UPDATE public.notifications
      SET body = 'Multiple employees posted new Featured Photos',
          created_at = now(),
          link = '/?photo=' || NEW.id,
          actor_id = NEW.user_id
      WHERE id = _recent_id;
    ELSE
      INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
      VALUES (
        _target.id,
        'featured_photo_created',
        'New Featured Photo',
        _author_name || ' posted a new Featured Photo',
        '/?photo=' || NEW.id,
        NEW.user_id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Update notify_on_photo_reaction: anti-spam for rapid toggling, grouping, Home deep-link
CREATE OR REPLACE FUNCTION public.notify_on_photo_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _photo_owner_id uuid;
  _reactor_name text;
  _recent_id uuid;
  _recent_count int;
BEGIN
  SELECT user_id INTO _photo_owner_id FROM public.user_photos WHERE id = NEW.photo_id;
  IF _photo_owner_id IS NULL OR _photo_owner_id = NEW.user_id THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = _photo_owner_id AND photo_reaction = false
  ) THEN RETURN NEW; END IF;

  -- Anti-spam: skip if same user triggered reaction notification in last 30s
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = _photo_owner_id
      AND type = 'featured_photo_reacted'
      AND actor_id = NEW.user_id
      AND link = '/?photo=' || NEW.photo_id
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  SELECT n.id INTO _recent_id
  FROM public.notifications n
  WHERE n.user_id = _photo_owner_id
    AND n.type = 'featured_photo_reacted'
    AND n.link = '/?photo=' || NEW.photo_id
    AND n.created_at > now() - interval '5 minutes'
  ORDER BY n.created_at DESC
  LIMIT 1;

  IF _recent_id IS NOT NULL THEN
    SELECT count(DISTINCT pr.user_id) INTO _recent_count
    FROM public.photo_reactions pr
    WHERE pr.photo_id = NEW.photo_id
      AND pr.created_at > now() - interval '5 minutes'
      AND pr.user_id != _photo_owner_id;

    UPDATE public.notifications
    SET body = _recent_count || ' people reacted to your Featured Photo',
        is_read = false,
        created_at = now(),
        actor_id = NEW.user_id
    WHERE id = _recent_id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _reactor_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
  VALUES (
    _photo_owner_id,
    'featured_photo_reacted',
    'Photo Reaction',
    _reactor_name || ' reacted to your Featured Photo',
    '/?photo=' || NEW.photo_id,
    NEW.user_id
  );
  RETURN NEW;
END;
$$;

-- Update notify_on_photo_tag: prevent duplicates on caption re-edit, inactive user check
CREATE OR REPLACE FUNCTION public.notify_on_photo_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tagger_name text;
  _photo_owner_id uuid;
BEGIN
  IF NEW.tagged_user_id = NEW.tagged_by_user_id THEN RETURN NEW; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.tagged_user_id AND is_active = true
  ) THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = NEW.tagged_user_id AND photo_mention = false
  ) THEN RETURN NEW; END IF;

  -- Prevent duplicate: skip if same tag notification exists within 1 hour
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.tagged_user_id
      AND type = 'featured_photo_tagged'
      AND link = '/?photo=' || NEW.photo_id
      AND created_at > now() - interval '1 hour'
  ) THEN RETURN NEW; END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _tagger_name
  FROM public.profiles p WHERE p.id = NEW.tagged_by_user_id;

  SELECT user_id INTO _photo_owner_id FROM public.user_photos WHERE id = NEW.photo_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, actor_id)
  VALUES (
    NEW.tagged_user_id,
    'featured_photo_tagged',
    'You were tagged in a photo',
    _tagger_name || ' tagged you in a Featured Photo',
    '/?photo=' || NEW.photo_id,
    NEW.tagged_by_user_id
  );
  RETURN NEW;
END;
$$;
