-- Add RFID UID field to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS rfid_uid TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_students_rfid_uid ON students(rfid_uid);

