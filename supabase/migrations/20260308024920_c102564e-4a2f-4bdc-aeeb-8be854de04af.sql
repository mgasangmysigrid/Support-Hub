UPDATE public.pto_ledger
SET remaining_hours = hours
WHERE entry_type = 'adjustment'
  AND remaining_hours IS NULL;