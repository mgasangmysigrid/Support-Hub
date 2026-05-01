
-- Photo tags table
CREATE TABLE IF NOT EXISTS public.photo_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.user_photos(id) ON DELETE CASCADE,
  tagged_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tagged_by_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(photo_id, tagged_user_id)
);

ALTER TABLE public.photo_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read photo tags"
  ON public.photo_tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own tags"
  ON public.photo_tags FOR INSERT TO authenticated
  WITH CHECK (tagged_by_user_id = auth.uid());

CREATE POLICY "Users can delete own tags"
  ON public.photo_tags FOR DELETE TO authenticated
  USING (tagged_by_user_id = auth.uid());

-- Notification preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  photo_new boolean NOT NULL DEFAULT true,
  photo_reaction boolean NOT NULL DEFAULT true,
  photo_mention boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger: notify all active users when a new Featured Photo is posted
CREATE OR REPLACE FUNCTION public.notify_on_new_photo()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _author_name text;
  _target RECORD;
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
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      _target.id,
      'featured_photo_created',
      'New Featured Photo',
      _author_name || ' posted a new Featured Photo',
      '/profile/' || NEW.user_id || '?photo=' || NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_photo ON public.user_photos;
CREATE TRIGGER trg_notify_new_photo
  AFTER INSERT ON public.user_photos
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_photo();

-- Trigger: reaction notifications
CREATE OR REPLACE FUNCTION public.notify_on_photo_reaction()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _photo_owner_id uuid;
  _reactor_name text;
  _recent_id uuid;
BEGIN
  SELECT user_id INTO _photo_owner_id FROM public.user_photos WHERE id = NEW.photo_id;
  IF _photo_owner_id = NEW.user_id THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = _photo_owner_id AND photo_reaction = false
  ) THEN RETURN NEW; END IF;

  SELECT n.id INTO _recent_id
  FROM public.notifications n
  WHERE n.user_id = _photo_owner_id
    AND n.type = 'featured_photo_reacted'
    AND n.link = '/profile/' || _photo_owner_id || '?photo=' || NEW.photo_id
    AND n.created_at > now() - interval '5 minutes'
  ORDER BY n.created_at DESC
  LIMIT 1;

  IF _recent_id IS NOT NULL THEN
    UPDATE public.notifications
    SET body = 'Multiple people reacted to your Featured Photo',
        is_read = false,
        created_at = now()
    WHERE id = _recent_id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _reactor_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    _photo_owner_id,
    'featured_photo_reacted',
    'Photo Reaction',
    _reactor_name || ' reacted to your Featured Photo',
    '/profile/' || _photo_owner_id || '?photo=' || NEW.photo_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_photo_reaction ON public.photo_reactions;
CREATE TRIGGER trg_notify_photo_reaction
  AFTER INSERT ON public.photo_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_photo_reaction();

-- Trigger: tag notifications
CREATE OR REPLACE FUNCTION public.notify_on_photo_tag()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _tagger_name text;
  _photo_owner_id uuid;
BEGIN
  IF NEW.tagged_user_id = NEW.tagged_by_user_id THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = NEW.tagged_user_id AND photo_mention = false
  ) THEN RETURN NEW; END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _tagger_name
  FROM public.profiles p WHERE p.id = NEW.tagged_by_user_id;

  SELECT user_id INTO _photo_owner_id FROM public.user_photos WHERE id = NEW.photo_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.tagged_user_id,
    'featured_photo_tagged',
    'You were tagged in a photo',
    _tagger_name || ' tagged you in a Featured Photo',
    '/profile/' || _photo_owner_id || '?photo=' || NEW.photo_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_photo_tag ON public.photo_tags;
CREATE TRIGGER trg_notify_photo_tag
  AFTER INSERT ON public.photo_tags
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_photo_tag();
