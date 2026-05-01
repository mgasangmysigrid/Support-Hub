
-- Storage policies for ticket-attachments bucket
-- Allow authenticated users to upload files (path: ticket_id/filename)
CREATE POLICY "Users can upload to accessible tickets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND public.can_access_ticket(auth.uid(), (storage.foldername(name))[1]::uuid)
);

-- Allow authenticated users to read files from accessible tickets
CREATE POLICY "Users can read attachments of accessible tickets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND public.can_access_ticket(auth.uid(), (storage.foldername(name))[1]::uuid)
);

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND owner = auth.uid()
);
