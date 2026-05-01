
ALTER TABLE public.departments ADD COLUMN display_order integer NOT NULL DEFAULT 99;

UPDATE public.departments SET display_order = 1 WHERE code = 'IT';
UPDATE public.departments SET display_order = 2 WHERE code = 'DEV';
UPDATE public.departments SET display_order = 3 WHERE code = 'PC';
UPDATE public.departments SET display_order = 4 WHERE code = 'MKT';
UPDATE public.departments SET display_order = 5 WHERE code = 'CS';
UPDATE public.departments SET display_order = 6 WHERE code = 'EXO';
