
-- Trigger: notify recipient when a document is issued
CREATE OR REPLACE FUNCTION public.notify_on_document_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _issuer_name text;
BEGIN
  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _issuer_name
  FROM public.profiles p WHERE p.id = NEW.issued_by_user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.recipient_user_id,
    'document_issued',
    CASE WHEN NEW.requires_signature THEN 'Document Requires Your Signature'
         ELSE 'New Document Issued to You'
    END,
    _issuer_name || ' issued "' || NEW.title || '"' ||
    CASE WHEN NEW.requires_signature THEN '. Please review and sign.' ELSE '.' END,
    '/documents'
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_notify_on_document_issued
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_document_issued();

-- Notify additional signers (not the recipient) when added
CREATE OR REPLACE FUNCTION public.notify_document_signer_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _doc RECORD;
  _issuer_name text;
BEGIN
  SELECT d.title, d.recipient_user_id, d.issued_by_user_id
  INTO _doc
  FROM public.documents d WHERE d.id = NEW.document_id;

  IF NEW.signer_user_id = _doc.recipient_user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'Someone') INTO _issuer_name
  FROM public.profiles p WHERE p.id = _doc.issued_by_user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.signer_user_id,
    'document_signature_request',
    'Signature Requested',
    _issuer_name || ' needs your signature on "' || _doc.title || '".',
    '/documents'
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_notify_document_signer_added
  AFTER INSERT ON public.document_signers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_document_signer_added();
