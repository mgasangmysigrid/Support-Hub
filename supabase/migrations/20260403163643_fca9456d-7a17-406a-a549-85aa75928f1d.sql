
-- Add control_number to leave_endorsements
ALTER TABLE public.leave_endorsements ADD COLUMN IF NOT EXISTS control_number text UNIQUE;

-- Add task-level status to leave_endorsement_items
ALTER TABLE public.leave_endorsement_items ADD COLUMN IF NOT EXISTS task_status text NOT NULL DEFAULT 'not_started';

-- Create sequence for control numbers
CREATE SEQUENCE IF NOT EXISTS endorsement_control_seq START 1;

-- Function to auto-generate control number on insert
CREATE OR REPLACE FUNCTION public.generate_endorsement_control_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.control_number IS NULL THEN
    NEW.control_number := 'END-' || EXTRACT(YEAR FROM NOW())::text || '-' || LPAD(nextval('endorsement_control_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_endorsement_control_number ON public.leave_endorsements;
CREATE TRIGGER trg_endorsement_control_number
  BEFORE INSERT ON public.leave_endorsements
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_endorsement_control_number();

-- Backfill existing endorsements that have no control_number
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.leave_endorsements WHERE control_number IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE public.leave_endorsements 
    SET control_number = 'END-' || EXTRACT(YEAR FROM NOW())::text || '-' || LPAD(nextval('endorsement_control_seq')::text, 4, '0')
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Function to auto-update parent status when all recipients acknowledge
CREATE OR REPLACE FUNCTION public.auto_update_endorsement_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_endorsement_id uuid;
  v_all_acknowledged boolean;
  v_current_status text;
BEGIN
  v_endorsement_id := NEW.endorsement_id;
  
  SELECT status INTO v_current_status FROM public.leave_endorsements WHERE id = v_endorsement_id;
  
  -- Only auto-update if currently 'open'
  IF v_current_status = 'open' THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM public.leave_endorsement_recipients
      WHERE endorsement_id = v_endorsement_id AND status = 'pending'
    ) INTO v_all_acknowledged;
    
    IF v_all_acknowledged THEN
      UPDATE public.leave_endorsements SET status = 'acknowledged', updated_at = now() WHERE id = v_endorsement_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_update_endorsement_status ON public.leave_endorsement_recipients;
CREATE TRIGGER trg_auto_update_endorsement_status
  AFTER UPDATE ON public.leave_endorsement_recipients
  FOR EACH ROW
  WHEN (NEW.status = 'acknowledged')
  EXECUTE FUNCTION public.auto_update_endorsement_status();
