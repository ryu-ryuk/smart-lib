# Smart Library System - Presentation Summary

## Quick Overview

**What it does**: Tracks student library entry/exit using RFID cards scanned by ESP32 devices.

**Components**:
- ESP32 hardware (RFID reader + display)
- Go Gateway (event processing)
- Python Admin API (management)
- PostgreSQL database
- Next.js frontend

---

## Hardware (ESP32)

### What it does:
- Continuously scans for RFID cards
- Reads card UID (unique identifier)
- Displays student name on OLED screen
- Sends events to backend via WiFi

### Key Features:
- **RFID Reading**: Uses MFRC522 module via SPI
- **Student Cache**: Stores recently seen cards to reduce API calls
- **Debouncing**: Prevents duplicate scans (2-second window)
- **Auto-Reconnect**: WiFi reconnects automatically if disconnected

### Data Sent:
```json
{
  "event_id": "uuid-here",
  "device_id": "esp32-device-001",
  "rfid_uid": "E44E6A05C5",
  "ts": "2024-01-15T10:30:45.123Z"
}
```

---

## Backend Gateway (Go)

### What it does:
- Receives events from ESP32 devices
- Authenticates devices using tokens
- Maps RFID UIDs to student admission numbers
- Determines if event is "entry" or "exit"
- Stores events in database

### Key Features:

#### 1. **Device Authentication**
- ESP32 sends token in header
- Gateway hashes token (SHA-256)
- Looks up device in database
- Prevents unauthorized devices

#### 2. **RFID to Student Mapping**
- Looks up RFID UID in `students` table
- Gets student admission number
- If not found → records in `rfid_unassigned` table

#### 3. **Entry/Exit Logic**
- Checks last event type for student
- If last was "entry" → current is "exit"
- If last was "exit" or NULL → current is "entry"
- Updates state atomically

#### 4. **Resilience**
- **Buffering**: If database fails, events stored in BoltDB
- **Retry**: Background worker retries every 10 seconds
- **Idempotency**: Duplicate events ignored (by event_id)

---

## Admin API (Python FastAPI)

### What it does:
- Manages students (create, list, search)
- Registers RFID cards to students
- Queries attendance records
- Tracks unassigned RFID cards
- Provides WebSocket for real-time updates

### Key Endpoints:

#### Student Management
- `GET /students` - List all students (with search)
- `POST /students` - Create new student
- `GET /students/by-rfid/{uid}` - Get student by RFID UID

#### RFID Registration
- `POST /students/register-rfid` - Link RFID card to student
- `DELETE /students/{admission_no}/rfid` - Remove RFID assignment

#### Attendance
- `GET /attendance` - Query attendance records
- `GET /attendance/current` - Get students currently in library

#### Unassigned RFID
- `GET /rfid/unassigned` - List scanned but unregistered cards

---

## Database Schema

### Core Tables:

1. **`device_registry`**
   - Stores ESP32 devices and token hashes
   - Used for authentication

2. **`students`**
   - Student information
   - Links to RFID UID

3. **`events_raw`**
   - Raw events from ESP32
   - Idempotent by event_id

4. **`attendance`**
   - Processed entry/exit events
   - Links to students

5. **`attendance_state`**
   - Tracks last event type per student
   - Used to determine next event type

6. **`rfid_unassigned`**
   - RFID cards scanned but not registered
   - Helps identify new cards

---

## Complete Data Flow

```
1. Student scans RFID card
   ↓
2. ESP32 reads UID, displays name
   ↓
3. ESP32 sends HTTP POST to Gateway
   ↓
4. Gateway authenticates device (token hash)
   ↓
5. Gateway looks up RFID → Student
   ↓
6. Gateway determines entry/exit
   ↓
7. Gateway writes to database (transaction)
   ↓
8. If database fails → buffer in BoltDB
   ↓
9. Retry worker processes buffer
   ↓
10. Frontend queries Admin API for display
```

---

## Security Features

1. **Device Authentication**
   - Token-based (SHA-256 hashed)
   - Tokens never stored in plaintext

2. **RFID Validation**
   - Only registered cards processed
   - Unregistered cards tracked separately

3. **Idempotent Operations**
   - Duplicate events ignored
   - Prevents double-counting

---

## Error Handling

### ESP32:
- WiFi auto-reconnect
- RFID read failures logged
- HTTP failures logged (gateway handles retry)

### Gateway:
- Database failures → buffer events
- Unregistered RFID → record and continue
- Retry worker processes buffer

### Admin API:
- Connection pooling
- WebSocket error handling
- RFID conflict prevention

---

## Key Design Decisions

1. **Separation of Concerns**
   - ESP32: Hardware only
   - Gateway: Event processing
   - Admin API: Business logic

2. **Resilience First**
   - Buffering at gateway level
   - Retry mechanisms
   - Idempotent operations

3. **Security by Design**
   - Token hashing
   - Device authentication
   - Input validation

4. **Scalability**
   - Stateless services
   - Database indexes
   - Connection pooling

---

## Future Enhancements

1. **Real-time Updates**
   - Gateway → Admin API WebSocket integration
   - Frontend live updates

2. **Multi-device Support**
   - Multiple ESP32 devices
   - Device-specific configurations

3. **Analytics**
   - Attendance reports
   - Time tracking
   - Statistics dashboard

4. **Notifications**
   - Email alerts
   - SMS notifications
   - Push notifications

---

## Questions & Answers

**Q: What happens if WiFi is down?**
A: ESP32 will cache student info and retry connection. Events are buffered at gateway level.

**Q: Can one RFID card be assigned to multiple students?**
A: No, the system prevents this. Force flag can reassign if needed.

**Q: How are duplicate scans handled?**
A: ESP32 debounces (2 seconds). Database uses event_id for idempotency.

**Q: What if database is down?**
A: Gateway buffers events in BoltDB. Retry worker processes them when DB is back.

**Q: How do I add a new ESP32 device?**
A: Generate token, hash it, insert into `device_registry` table, configure ESP32.

---

## Technical Stack

- **Hardware**: ESP32, MFRC522, SSD1306
- **Firmware**: ESP-IDF (C)
- **Gateway**: Go (net/http, PostgreSQL, BoltDB)
- **Admin API**: Python FastAPI (asyncpg/psycopg2)
- **Database**: PostgreSQL
- **Frontend**: Next.js (React, TypeScript)

---

## Deployment

### Development:
```bash
./scripts/dev.sh up
```

### Production:
- PostgreSQL: AWS RDS or similar
- Gateway: Container (Docker)
- Admin API: Container (Docker)
- Frontend: Vercel
- ESP32: Flash firmware with production config

---

## Conclusion

This system provides a **robust, scalable IoT attendance solution** with:
- ✅ Hardware integration (ESP32 + RFID)
- ✅ Secure device authentication
- ✅ Resilient event processing
- ✅ Real-time capabilities (WebSocket ready)
- ✅ Comprehensive error handling
- ✅ Scalable architecture

The codebase is well-structured, documented, and ready for production deployment.

