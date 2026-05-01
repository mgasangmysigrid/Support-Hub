
ALTER TYPE endorsement_status ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE endorsement_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE endorsement_status ADD VALUE IF NOT EXISTS 'closed';
