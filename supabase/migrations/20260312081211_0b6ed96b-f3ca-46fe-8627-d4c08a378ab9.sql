-- Allow authenticated users to upload signed PDFs to documents/signed/ path
CREATE POLICY "Signers can upload signed PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'signed'
);

-- Allow authenticated users to read signed PDFs
CREATE POLICY "Authenticated can read signed documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'signed'
);

-- Allow signers to update (upsert) signed PDFs
CREATE POLICY "Signers can update signed PDFs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'signed'
)
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'signed'
);