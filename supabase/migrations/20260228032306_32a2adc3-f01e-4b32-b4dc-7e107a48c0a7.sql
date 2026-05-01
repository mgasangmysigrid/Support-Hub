UPDATE public.notifications
SET body = REPLACE(body, 'Internal Docs', 'Company Updates')
WHERE body LIKE '%Internal Docs%';