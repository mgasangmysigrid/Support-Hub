
-- Trigger function: log activity + notify on attachment insert
CREATE OR REPLACE FUNCTION public.notify_on_attachment_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ticket RECORD;
  _uploader_name text;
  _title text;
  _body text;
  _notified_ids uuid[] := ARRAY[]::uuid[];
  _ta RECORD;
BEGIN
  -- Skip inline images (pasted into description)
  IF NEW.is_inline = true THEN
    RETURN NEW;
  END IF;

  SELECT t.id, t.ticket_no, t.title AS ticket_title, t.requester_id, t.assignee_id
  INTO _ticket
  FROM public.tickets t
  WHERE t.id = NEW.ticket_id;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _uploader_name
  FROM public.profiles p WHERE p.id = NEW.uploaded_by;

  -- Log activity
  INSERT INTO public.ticket_activity (ticket_id, actor_id, action, to_value)
  VALUES (NEW.ticket_id, NEW.uploaded_by, 'attachment_added',
          jsonb_build_object('file_name', NEW.file_name));

  _title := 'Attachment Added';
  _body := _uploader_name || ' attached "' || NEW.file_name || '" to ' || _ticket.ticket_no;

  -- Notify requester
  IF NEW.uploaded_by IS DISTINCT FROM _ticket.requester_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.requester_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
    _notified_ids := array_append(_notified_ids, _ticket.requester_id);
  END IF;

  -- Notify all assignees
  FOR _ta IN
    SELECT DISTINCT ta.user_id
    FROM public.ticket_assignees ta
    WHERE ta.ticket_id = NEW.ticket_id
    AND ta.user_id IS DISTINCT FROM NEW.uploaded_by
    AND ta.user_id != ALL(_notified_ids)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ta.user_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
    _notified_ids := array_append(_notified_ids, _ta.user_id);
  END LOOP;

  -- Notify primary assignee if not covered
  IF _ticket.assignee_id IS NOT NULL
     AND _ticket.assignee_id IS DISTINCT FROM NEW.uploaded_by
     AND _ticket.assignee_id != ALL(_notified_ids) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_ticket.assignee_id, 'ticket_activity', _title, _body, '/tickets/' || _ticket.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger on attachment insert
DROP TRIGGER IF EXISTS trg_notify_attachment_added ON public.ticket_attachments;
CREATE TRIGGER trg_notify_attachment_added
  AFTER INSERT ON public.ticket_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_attachment_added();

-- Update RLS: allow assignees/managers/requester to delete attachments
DROP POLICY IF EXISTS "Users can delete own attachments" ON public.ticket_attachments;
CREATE POLICY "Users can delete own attachments"
  ON public.ticket_attachments
  FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_attachments.ticket_id
      AND (
        is_dept_manager(auth.uid(), t.department_id)
        OR EXISTS (
          SELECT 1 FROM public.ticket_assignees ta
          WHERE ta.ticket_id = t.id AND ta.user_id = auth.uid()
        )
      )
    )
  );
