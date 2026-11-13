-- NULL now means "never picked": the user gets their role's default scheme (auth.colorSchemeSQL: taxpayers
-- Sunset, support Ocean, admins Graphite), so changing a default later needs no data migration. Until now Evergreen was stored as the
-- default for everyone, so those rows can't be told apart from a deliberate choice; in the demo none were
-- deliberate, and they move to the new default.
ALTER TABLE users ALTER COLUMN color_scheme DROP NOT NULL, ALTER COLUMN color_scheme DROP DEFAULT;
UPDATE users SET color_scheme = NULL WHERE color_scheme = 'evergreen';
