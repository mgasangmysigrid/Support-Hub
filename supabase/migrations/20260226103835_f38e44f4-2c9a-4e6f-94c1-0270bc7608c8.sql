ALTER TABLE public.ticket_attachments 
ADD COLUMN comment_id uuid REFERENCES public.ticket_comments(id) ON DELETE CASCADE DEFAULT NULL;

-- Add index for querying attachments by comment
CREATE INDEX idx_ticket_attachments_comment_id ON public.ticket_attachments(comment_id) WHERE comment_id IS NOT NULL;

-- Add a flag to mark images pasted into description (no comment_id, is_inline = true)
ALTER TABLE public.ticket_attachments 
ADD COLUMN is_inline boolean NOT NULL DEFAULT false;