-- Remove duplicate reads first (keep the earliest one per user+doc)
DELETE FROM public.knowledge_base_reads a
USING public.knowledge_base_reads b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.doc_id = b.doc_id;

-- Add unique constraint
ALTER TABLE public.knowledge_base_reads
ADD CONSTRAINT knowledge_base_reads_user_doc_unique UNIQUE (user_id, doc_id);