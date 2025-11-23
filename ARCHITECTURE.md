# Smart Lib System - Hardware & Backend Architecture

## System Overview

IoT-based attendance system tracking student entry/exit using RFID cards.

**Components**:
- ESP32 + MFRC522 RFID reader + SSD1306 OLED display
- Go Gateway (event processing, port 8080)
- Python FastAPI Admin API (management, port 8001)
- PostgreSQL database

**Architecture Flow**:
```
ESP32 → HTTP POST /api/events → Gateway → PostgreSQL
                                      ↓
                              Admin API ← Frontend
```

---

## Hardware Layer (ESP32)

### Core Functionality

**RFID Reading** (`rfid_reader_task`):
- Polls MFRC522 via SPI every 125ms
- Reads 5-byte UID, converts to hex (e.g., "E44E6A05C5")
- ISO14443A protocol: REQA → Anti-collision → Halt

**Student Cache** (16 entries):
- Stores RFID UID → student name mapping
- Reduces API calls, enables offline display
- Fetches from `/students/by-rfid/{uid}` if not cached

**Event Transmission**:
- Generates UUID and RFC3339 timestamp
- 2-second debounce prevents duplicates
- POST to `GATEWAY_URL/api/events` with `X-Device-Token` header
- JSON: `{"event_id", "device_id", "rfid_uid", "ts"}`

**WiFi**: Auto-reconnects on disconnect

**Pins** (config.h):
- RC522: SPI2 (GPIO 18/19/23), SDA=GPIO5, RST=GPIO4
- OLED: I2C (GPIO 21/22), Address=0x3C

---

## Backend Gateway (Go)

### Authentication

SHA-256 hash of token → lookup in `device_registry`:
```go
hash := sha256.Sum256([]byte(token))
SELECT device_id FROM device_registry WHERE token_hash = hash
```

### Event Processing Flow

1. **Authenticate** device token
2. **Map RFID UID** → `admission_no` from `students` table
3. **Determine event type**: Query `attendance_state.last_event_type`
   - If "entry" → current is "exit"
   - Otherwise → current is "entry"
4. **Write transaction**:
   - Insert `events_raw` (idempotent by event_id)
   - Insert `attendance` (idempotent by event_id)
   - Update `attendance_state`
5. **Error handling**:
   - Unregistered RFID → record in `rfid_unassigned`, return 202
   - DB failure → buffer in BoltDB, retry worker processes every 10s

### Retry Worker

- Reads buffered events from BoltDB every 10 seconds
- Retries `writeEvent()`
- Removes successful events
- Drops unregistered RFID events to prevent loops

---

## Admin API (Python FastAPI)

### Key Endpoints

**Student Management**:
- `GET /students` - List/search students
- `POST /students` - Create student
- `GET /students/by-rfid/{uid}` - Lookup by RFID (used by ESP32)

**RFID Registration**:
- `POST /students/register-rfid` - Link RFID to student
- Prevents duplicates unless `force=true`
- Removes from `rfid_unassigned` after registration

**Attendance**:
- `GET /attendance` - Query records (filter by date/admission_no)
- `GET /attendance/current` - Students currently in library

**Unassigned RFID**:
- `GET /rfid/unassigned` - List scanned but unregistered cards

**WebSocket** (`/ws/events`): Ready for real-time updates (gateway integration pending)

---

## Database Schema

### Tables

**`device_registry`**: Device auth tokens (token_hash = SHA256 of plain token)
```sql
device_id TEXT PRIMARY KEY, token_hash TEXT, device_type TEXT
```

**`students`**: Student info + RFID assignment
```sql
admission_no TEXT PRIMARY KEY, name TEXT, branch TEXT, year INT, rfid_uid TEXT
```

**`events_raw`**: Raw events from ESP32 (idempotent by event_id)
```sql
event_id UUID PRIMARY KEY, device_id TEXT, admission_no TEXT, ts TIMESTAMPTZ, raw_json JSONB
```

**`attendance`**: Processed entry/exit events (idempotent by event_id)
```sql
id BIGSERIAL, event_id UUID UNIQUE, admission_no TEXT, event_type TEXT, ts TIMESTAMPTZ, device_id TEXT
```

**`attendance_state`**: Last event type per student (determines next event)
```sql
admission_no TEXT PRIMARY KEY, last_event_type TEXT, last_ts TIMESTAMPTZ
```

**`rfid_unassigned`**: Scanned but unregistered RFID cards
```sql
rfid_uid TEXT PRIMARY KEY, first_seen TIMESTAMPTZ, last_seen TIMESTAMPTZ, seen_count INT, device_id TEXT, last_event JSONB
```

### Indexes
- `attendance(admission_no, ts DESC)`
- `events_raw(device_id, ts DESC)`
- `attendance(ts DESC)`

---

## Data Flow

1. **ESP32**: Scan RFID → Read UID → Check cache → Fetch student info if needed
2. **ESP32**: Generate UUID + timestamp → POST to Gateway with device token
3. **Gateway**: Authenticate token → Map RFID to student → Determine entry/exit
4. **Gateway**: Write to DB (events_raw, attendance, attendance_state) in transaction
5. **Error**: If DB fails → buffer in BoltDB → retry worker processes later
6. **Unregistered**: Record in `rfid_unassigned`, return 202

---

## Security

- **Device Auth**: SHA-256 hashed tokens in DB, plain tokens in ESP32 config
- **Idempotency**: `ON CONFLICT DO NOTHING` prevents duplicate events
- **RFID Validation**: Only registered cards processed

---

## Error Handling

- **ESP32**: WiFi auto-reconnect, RFID failures logged, HTTP failures logged
- **Gateway**: DB failures → BoltDB buffer, retry every 10s, unregistered RFID tracked
- **Admin API**: Connection pooling, WebSocket error handling, RFID conflict prevention
