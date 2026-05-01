
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS signed_file_path text;

-- Migrate existing signed_file_url values to signed_file_path by extracting the storage path
-- The signed URLs contain paths like "signed/signed-{id}-{timestamp}.pdf"
UPDATE public.documents 
SET signed_file_path = regexp_replace(signed_file_url, '^.*/object/sign/documents/', '')
WHERE signed_file_url IS NOT NULL 
  AND signed_file_path IS NULL
  AND signed_file_url LIKE '%/object/sign/documents/%';

-- For URLs that follow a different pattern, extract after /documents/
UPDATE public.documents 
SET signed_file_path = regexp_replace(signed_file_url, '^.*/storage/v1/object/sign/documents/([^?]+).*$', '\1')
WHERE signed_file_url IS NOT NULL 
  AND signed_file_path IS NULL;
