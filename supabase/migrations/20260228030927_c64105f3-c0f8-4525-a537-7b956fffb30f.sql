
CREATE OR REPLACE FUNCTION public.notify_new_kb_doc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _author_name text;
  _user RECORD;
BEGIN
  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _author_name
  FROM public.profiles p WHERE p.id = NEW.created_by;

  FOR _user IN
    SELECT id FROM public.profiles WHERE is_active = true AND id != NEW.created_by
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      _user.id,
      'knowledge_base',
      'New Document: ' || NEW.title,
      _author_name || ' published a new document in Company Updates',
      '/knowledge-base'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;
