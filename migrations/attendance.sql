-- Database migrations for attendance system

CREATE TABLE IF NOT EXISTS device_registry (
  device_id TEXT PRIMARY KEY,
  device_type TEXT NOT NULL,
  token_hash TEXT,          -- hashed device token / credential reference
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  admission_no TEXT PRIMARY KEY,
  name TEXT,
  branch TEXT,
  year INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events_raw (
  event_id UUID PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES device_registry(device_id),
  admission_no TEXT NOT NULL REFERENCES students(admission_no),
  ts TIMESTAMPTZ NOT NULL,
  raw_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE,
  admission_no TEXT REFERENCES students(admission_no),
  event_type TEXT NOT NULL,  -- 'entry' | 'exit'
  ts TIMESTAMPTZ NOT NULL,
  device_id TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_state (
  admission_no TEXT PRIMARY KEY REFERENCES students(admission_no),
  last_event_type TEXT,
  last_ts TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_attendance_adm_ts ON attendance(admission_no, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_raw_device_ts ON events_raw(device_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_ts ON attendance(ts DESC);

