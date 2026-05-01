
CREATE OR REPLACE FUNCTION public.search_my_tickets(
  _user_id uuid,
  _search_term text
)
RETURNS TABLE(ticket_id uuid, match_context text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _term text := '%' || lower(trim(_search_term)) || '%';
BEGIN
  IF trim(_search_term) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT t.id AS ticket_id,
    CASE
      WHEN lower(t.ticket_no) LIKE _term THEN 'ticket_no'
      WHEN lower(t.title) LIKE _term THEN 'title'
      WHEN lower(t.description) LIKE _term THEN 'description'
      WHEN lower(COALESCE(req.full_name, '')) LIKE _term THEN 'requester'
      WHEN lower(COALESCE(own.full_name, '')) LIKE _term THEN 'owner'
      WHEN lower(COALESCE(dept.name, '')) LIKE _term THEN 'department'
      WHEN EXISTS (
        SELECT 1 FROM ticket_comments tc
        WHERE tc.ticket_id = t.id AND lower(tc.body) LIKE _term
      ) THEN 'comment'
      WHEN EXISTS (
        SELECT 1 FROM ticket_attachments ta
        WHERE ta.ticket_id = t.id AND lower(ta.file_name) LIKE _term
      ) THEN 'attachment'
      WHEN EXISTS (
        SELECT 1 FROM ticket_collaborators tcol
        JOIN profiles cp ON cp.id = tcol.user_id
        WHERE tcol.ticket_id = t.id AND lower(COALESCE(cp.full_name, '')) LIKE _term
      ) THEN 'collaborator'
      WHEN EXISTS (
        SELECT 1 FROM ticket_assignees taa
        JOIN profiles ap ON ap.id = taa.user_id
        WHERE taa.ticket_id = t.id AND lower(COALESCE(ap.full_name, '')) LIKE _term
      ) THEN 'assignee'
      ELSE 'other'
    END AS match_context
  FROM tickets t
  LEFT JOIN profiles req ON req.id = t.requester_id
  LEFT JOIN profiles own ON own.id = t.primary_assignee_id
  LEFT JOIN departments dept ON dept.id = t.department_id
  WHERE (
    -- User must have access to the ticket
    t.requester_id = _user_id
    OR t.primary_assignee_id = _user_id
    OR EXISTS (SELECT 1 FROM ticket_collaborators tc2 WHERE tc2.ticket_id = t.id AND tc2.user_id = _user_id)
    OR EXISTS (SELECT 1 FROM ticket_assignees ta2 WHERE ta2.ticket_id = t.id AND ta2.user_id = _user_id)
  )
  AND (
    -- Match against searchable fields
    lower(t.ticket_no) LIKE _term
    OR lower(t.title) LIKE _term
    OR lower(t.description) LIKE _term
    OR lower(COALESCE(req.full_name, '')) LIKE _term
    OR lower(COALESCE(own.full_name, '')) LIKE _term
    OR lower(COALESCE(dept.name, '')) LIKE _term
    OR EXISTS (
      SELECT 1 FROM ticket_comments tc
      WHERE tc.ticket_id = t.id AND lower(tc.body) LIKE _term
    )
    OR EXISTS (
      SELECT 1 FROM ticket_attachments ta
      WHERE ta.ticket_id = t.id AND lower(ta.file_name) LIKE _term
    )
    OR EXISTS (
      SELECT 1 FROM ticket_collaborators tcol
      JOIN profiles cp ON cp.id = tcol.user_id
      WHERE tcol.ticket_id = t.id AND lower(COALESCE(cp.full_name, '')) LIKE _term
    )
    OR EXISTS (
      SELECT 1 FROM ticket_assignees taa
      JOIN profiles ap ON ap.id = taa.user_id
      WHERE taa.ticket_id = t.id AND lower(COALESCE(ap.full_name, '')) LIKE _term
    )
  );
END;
$$;
