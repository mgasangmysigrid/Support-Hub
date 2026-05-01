
-- Table to track which KB docs each user has read
CREATE TABLE public.knowledge_base_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_id uuid NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, doc_id)
);

ALTER TABLE public.knowledge_base_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own kb reads" ON public.knowledge_base_reads
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own kb reads" ON public.knowledge_base_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Trigger to notify all users when a new KB doc is created
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
      _author_name || ' published a new document in Internal Docs',
      '/knowledge-base'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_notify_new_kb_doc
  AFTER INSERT ON public.knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_kb_doc();
