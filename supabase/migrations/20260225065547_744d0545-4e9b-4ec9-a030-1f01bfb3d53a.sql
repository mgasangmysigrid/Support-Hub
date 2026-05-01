-- Allow super_admins to delete tickets
CREATE POLICY "Super admin can delete tickets"
ON public.tickets
FOR DELETE
USING (public.is_super_admin(auth.uid()));

-- Also allow deleting related data when ticket is deleted
CREATE POLICY "Super admin can delete ticket comments"
ON public.ticket_comments
FOR DELETE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can delete ticket activity"
ON public.ticket_activity
FOR DELETE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can delete ticket attachments"
ON public.ticket_attachments
FOR DELETE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can delete ticket assignees"
ON public.ticket_assignees
FOR DELETE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can delete ticket survey"
ON public.ticket_survey
FOR DELETE
USING (public.is_super_admin(auth.uid()));