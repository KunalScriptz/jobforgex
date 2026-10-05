-- Ensure every workspace that has resumes has exactly ONE default template.
-- (003 backfilled only a single global row; fix it per workspace, idempotently.)

-- Fill a default for workspaces that have none: prefer the most recently
-- updated is_base row, falling back to the most recently updated row.
UPDATE resumes r SET is_default = TRUE
WHERE r.id = (
    SELECT r2.id FROM resumes r2
    WHERE r2.workspace_id = r.workspace_id
    ORDER BY r2.is_base DESC, r2.updated_at DESC, r2.id
    LIMIT 1
)
AND NOT EXISTS (
    SELECT 1 FROM resumes r3
    WHERE r3.workspace_id = r.workspace_id AND r3.is_default = TRUE
);

-- Collapse duplicate defaults per workspace: keep only the most recently
-- updated one (deterministic tiebreak by id).
UPDATE resumes r SET is_default = FALSE
WHERE r.is_default = TRUE
AND EXISTS (
    SELECT 1 FROM resumes r4
    WHERE r4.workspace_id = r.workspace_id AND r4.is_default = TRUE
      AND (r4.updated_at > r.updated_at
           OR (r4.updated_at = r.updated_at AND r4.id::text > r.id::text))
);
