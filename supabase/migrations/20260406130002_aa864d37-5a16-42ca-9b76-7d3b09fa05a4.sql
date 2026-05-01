
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS work_start_time time DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS work_end_time time DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS work_timezone text DEFAULT 'Asia/Manila';
