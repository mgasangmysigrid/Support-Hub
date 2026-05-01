
-- Add cancellation fields to tickets
ALTER TABLE public.tickets
ADD COLUMN cancelled_at timestamp with time zone DEFAULT NULL,
ADD COLUMN cancellation_reason text DEFAULT NULL;
