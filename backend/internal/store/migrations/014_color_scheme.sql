-- The portal color scheme each user picked. Kept on the account so it follows them to any device.
-- The ids match the frontend's src/schemes.js.
ALTER TABLE users ADD COLUMN color_scheme text NOT NULL DEFAULT 'evergreen'
  CHECK (color_scheme IN ('evergreen', 'ocean', 'sunset', 'plum', 'graphite'));
