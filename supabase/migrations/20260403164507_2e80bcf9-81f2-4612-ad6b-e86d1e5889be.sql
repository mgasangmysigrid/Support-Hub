
-- Add 'made_progress' to task status options (no enum, just text column - already flexible)
-- No schema change needed for task_status since it's a text column

-- Auto-update parent endorsement from 'acknowledged' to 'in_progress' when any task progresses
CREATE OR REPLACE FUNCTION public.auto_update_endorsement_on_task_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_endorsement_id uuid;
  v_current_status text;
BEGIN
  v_endorsement_id := NEW.endorsement_id;
  
  SELECT status INTO v_current_status FROM public.leave_endorsements WHERE id = v_endorsement_id;
  
  -- Auto-transition from acknowledged to in_progress when any task progresses
  IF v_current_status = 'acknowledged' AND NEW.task_status IN ('in_progress', 'made_progress', 'done') THEN
    UPDATE public.leave_endorsements 
    SET status = 'in_progress', updated_at = now() 
    WHERE id = v_endorsement_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_endorsement_task_progress ON public.leave_endorsement_items;
CREATE TRIGGER trg_auto_endorsement_task_progress
  AFTER UPDATE ON public.leave_endorsement_items
  FOR EACH ROW
  WHEN (NEW.task_status IS DISTINCT FROM OLD.task_status)
  EXECUTE FUNCTION public.auto_update_endorsement_on_task_progress();

-- Allow recipients (assignees) to update task_status on items assigned to them
DROP POLICY IF EXISTS "Assignees can update task status" ON public.leave_endorsement_items;
CREATE POLICY "Assignees can update task status"
ON public.leave_endorsement_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.endorsement_item_assignees eia
    WHERE eia.endorsement_item_id = leave_endorsement_items.id
    AND eia.user_id = auth.uid()
  )
);
