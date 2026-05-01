
-- Performance indexes for search joins
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON public.ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_collaborators_ticket_id ON public.ticket_collaborators(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignees_ticket_id ON public.ticket_assignees(ticket_id);

-- Update search function with normalized ticket_no matching
DROP FUNCTION IF EXISTS public.search_my_tickets(uuid, text);

CREATE OR REPLACE FUNCTION public.search_my_tickets(
  _user_id uuid,
  _search_term text
)
RETURNS TABLE(ticket_id uuid, match_context text, match_rank integer, match_snippet text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _raw text := lower(trim(_search_term));
  _term text := '%' || _raw || '%';
  _ticket_no_term text;
BEGIN
  IF _raw = '' THEN
    RETURN;
  END IF;

  -- Normalize ticket number: strip "ms-" prefix and dept codes for forgiving matching
  _ticket_no_term := '%' || regexp_replace(_raw, '^ms-?', '', 'i') || '%';

  RETURN QUERY
  SELECT DISTINCT ON (t.id)
    t.id AS ticket_id,
    ctx.match_context,
    ctx.match_rank,
    ctx.match_snippet
  FROM tickets t
  LEFT JOIN profiles req ON req.id = t.requester_id
  LEFT JOIN profiles own ON own.id = t.primary_assignee_id
  LEFT JOIN departments dept ON dept.id = t.department_id
  CROSS JOIN LATERAL (
    SELECT v.match_context, v.match_rank, v.match_snippet
    FROM (VALUES
      -- Exact ticket number
      (CASE WHEN lower(t.ticket_no) = _raw THEN 'ticket_no' END, 1,
       CASE WHEN lower(t.ticket_no) = _raw THEN t.ticket_no END),
      -- Partial ticket number (with normalized matching)
      (CASE WHEN lower(t.ticket_no) LIKE _ticket_no_term AND lower(t.ticket_no) != _raw THEN 'ticket_no' END, 2,
       CASE WHEN lower(t.ticket_no) LIKE _ticket_no_term AND lower(t.ticket_no) != _raw THEN t.ticket_no END),
      -- Title
      (CASE WHEN lower(t.title) LIKE _term THEN 'title' END, 3,
       CASE WHEN lower(t.title) LIKE _term THEN left(t.title, 120) END),
      -- Description
      (CASE WHEN lower(t.description) LIKE _term THEN 'description' END, 4,
       CASE WHEN lower(t.description) LIKE _term THEN
         left(substring(t.description from greatest(1, position(_raw in lower(t.description)) - 30) for 100), 100)
       END),
      -- Comments
      (CASE WHEN EXISTS (SELECT 1 FROM ticket_comments tc WHERE tc.ticket_id = t.id AND lower(tc.body) LIKE _term) THEN 'comment' END, 5,
       (SELECT left(substring(tc2.body from greatest(1, position(_raw in lower(tc2.body)) - 30) for 100), 100)
        FROM ticket_comments tc2 WHERE tc2.ticket_id = t.id AND lower(tc2.body) LIKE _term LIMIT 1)),
      -- Requester name
      (CASE WHEN lower(COALESCE(req.full_name, '')) LIKE _term THEN 'requester' END, 6,
       CASE WHEN lower(COALESCE(req.full_name, '')) LIKE _term THEN req.full_name END),
      -- Owner name
      (CASE WHEN lower(COALESCE(own.full_name, '')) LIKE _term THEN 'owner' END, 6,
       CASE WHEN lower(COALESCE(own.full_name, '')) LIKE _term THEN own.full_name END),
      -- Collaborator name
      (CASE WHEN EXISTS (SELECT 1 FROM ticket_collaborators tcol JOIN profiles cp ON cp.id = tcol.user_id WHERE tcol.ticket_id = t.id AND lower(COALESCE(cp.full_name, '')) LIKE _term) THEN 'collaborator' END, 7,
       (SELECT cp2.full_name FROM ticket_collaborators tcol2 JOIN profiles cp2 ON cp2.id = tcol2.user_id WHERE tcol2.ticket_id = t.id AND lower(COALESCE(cp2.full_name, '')) LIKE _term LIMIT 1)),
      -- Assignee name
      (CASE WHEN EXISTS (SELECT 1 FROM ticket_assignees taa JOIN profiles ap ON ap.id = taa.user_id WHERE taa.ticket_id = t.id AND lower(COALESCE(ap.full_name, '')) LIKE _term) THEN 'assignee' END, 7,
       (SELECT ap2.full_name FROM ticket_assignees taa2 JOIN profiles ap2 ON ap2.id = taa2.user_id WHERE taa2.ticket_id = t.id AND lower(COALESCE(ap2.full_name, '')) LIKE _term LIMIT 1)),
      -- Attachment filename
      (CASE WHEN EXISTS (SELECT 1 FROM ticket_attachments ta WHERE ta.ticket_id = t.id AND lower(ta.file_name) LIKE _term) THEN 'attachment' END, 8,
       (SELECT ta2.file_name FROM ticket_attachments ta2 WHERE ta2.ticket_id = t.id AND lower(ta2.file_name) LIKE _term LIMIT 1)),
      -- Department name
      (CASE WHEN lower(COALESCE(dept.name, '')) LIKE _term THEN 'department' END, 8,
       CASE WHEN lower(COALESCE(dept.name, '')) LIKE _term THEN dept.name END)
    ) AS v(match_context, match_rank, match_snippet)
    WHERE v.match_context IS NOT NULL
    ORDER BY v.match_rank ASC
    LIMIT 1
  ) ctx
  WHERE (
    t.requester_id = _user_id
    OR t.primary_assignee_id = _user_id
    OR EXISTS (SELECT 1 FROM ticket_collaborators tc2 WHERE tc2.ticket_id = t.id AND tc2.user_id = _user_id)
    OR EXISTS (SELECT 1 FROM ticket_assignees ta2 WHERE ta2.ticket_id = t.id AND ta2.user_id = _user_id)
  )
  AND (
    lower(t.ticket_no) LIKE _ticket_no_term
    OR lower(t.title) LIKE _term
    OR lower(t.description) LIKE _term
    OR lower(COALESCE(req.full_name, '')) LIKE _term
    OR lower(COALESCE(own.full_name, '')) LIKE _term
    OR lower(COALESCE(dept.name, '')) LIKE _term
    OR EXISTS (SELECT 1 FROM ticket_comments tc WHERE tc.ticket_id = t.id AND lower(tc.body) LIKE _term)
    OR EXISTS (SELECT 1 FROM ticket_attachments ta WHERE ta.ticket_id = t.id AND lower(ta.file_name) LIKE _term)
    OR EXISTS (SELECT 1 FROM ticket_collaborators tcol JOIN profiles cp ON cp.id = tcol.user_id WHERE tcol.ticket_id = t.id AND lower(COALESCE(cp.full_name, '')) LIKE _term)
    OR EXISTS (SELECT 1 FROM ticket_assignees taa JOIN profiles ap ON ap.id = taa.user_id WHERE taa.ticket_id = t.id AND lower(COALESCE(ap.full_name, '')) LIKE _term)
  )
  ORDER BY t.id, ctx.match_rank ASC;
END;
$$;
