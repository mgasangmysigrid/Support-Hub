
-- Fix permissive INSERT policy on notifications (only service_role should insert)
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Seed departments
INSERT INTO public.departments (name, code) VALUES
  ('IT Support', 'IT'),
  ('Development Team', 'DEV'),
  ('People & Culture', 'PC'),
  ('Customer Success', 'CS'),
  ('Marketing', 'MKT'),
  ('Executive Office', 'EXO');

-- Seed dept_sequences for each department
INSERT INTO public.dept_sequences (department_id, next_number)
SELECT id, 1 FROM public.departments;
