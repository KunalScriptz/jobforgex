-- User profile fields for salary + location (onboarding / settings / Ask AI).
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_salary   NUMERIC(12, 2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_currency  VARCHAR(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_frequency VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location         TEXT;
