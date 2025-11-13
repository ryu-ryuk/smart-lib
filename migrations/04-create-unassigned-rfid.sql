CREATE TABLE IF NOT EXISTS rfid_unassigned (
  rfid_uid TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count INT NOT NULL DEFAULT 1,
  device_id TEXT,
  last_event JSONB
);

CREATE INDEX IF NOT EXISTS idx_rfid_unassigned_last_seen ON rfid_unassigned (last_seen DESC);

