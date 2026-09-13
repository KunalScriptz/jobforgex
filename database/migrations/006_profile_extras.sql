-- Profile extras: avatar preset + fields used by the Chrome extension's autofill.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_preset    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_url    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_title    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_company  TEXT;
