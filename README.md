# Smart Library Management System

IoT-based attendance tracking system using ESP32 and RFID technology for automated student entry/exit monitoring.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Hardware Setup](#hardware-setup)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Documentation](#documentation)

## Features

- **RFID-based Attendance**: Automatic entry/exit tracking using MFRC522 RFID reader
- **Real-time Processing**: Go gateway handles events with buffering and retry mechanisms
- **Student Management**: FastAPI admin interface for managing students and RFID cards
- **Web Dashboard**: Next.js frontend for viewing attendance records and analytics
- **Device Authentication**: Secure token-based authentication for ESP32 devices
- **Resilient Architecture**: Event buffering and automatic retry on database failures
- **Unassigned RFID Tracking**: Automatic detection of scanned but unregistered cards

## Architecture

```
┌─────────────┐
│   ESP32     │  RFID Reader + OLED Display
│  Device     │
└──────┬──────┘
       │ HTTP POST /api/events
       │ (X-Device-Token)
       ▼
┌─────────────┐
│   Gateway   │  Go Service (Port 8080)
│  Service    │  Event Processing & Buffering
└──────┬──────┘
       │
       ├──► PostgreSQL Database
       │
       └──► Admin API (Port 8001)
           │
           ├──► WebSocket /ws/events
           └──► REST API
```

For detailed architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Tech Stack

### Hardware
- **ESP32**: Microcontroller with WiFi
- **MFRC522**: RFID reader module (SPI)
- **SSD1306**: OLED display (I2C)

### Backend
- **Go**: Gateway service (event processing, buffering)
- **Python FastAPI**: Admin API (student management, attendance queries)
- **PostgreSQL**: Database (persistent storage)
- **BoltDB**: Embedded KV store (event buffering)

### Frontend
- **Next.js 16**: React framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Radix UI**: Component library

## Quick Start

### Prerequisites

- Docker with Compose
- Node.js 18+
- Python 3.10+
- Go 1.22+
- ESP-IDF (for hardware development)

### One-Command Setup

Start the entire development stack:

```bash
./scripts/dev.sh up
```

This will:
- Start PostgreSQL in Docker and run migrations
- Start Python Admin API on `http://localhost:8001`
- Start Go Gateway on `http://localhost:8080`
- Launch Next.js frontend on `http://localhost:3000`

Stop everything:

```bash
./scripts/dev.sh down
```

### Register RFID Tag

1. Scan the tag with ESP32 and note the UID from logs (e.g., `E44E6A05C5`)
2. Link it to a student:

```bash
npm run register-rfid -- --admission 24GCE24001 --rfid E44E6A05C5
```

### Import Students

Import students from CSV:

```bash
node scripts/import-students-from-csv.js path/to/file.csv
```

## Project Structure
## Project structure (high-level)

- `esp32/` — ESP32 firmware (RFID + display)
- `gateway/` — Go gateway (event processing & buffering)
- `admin/` — FastAPI admin API (student & RFID management)
- `app/` — Next.js frontend (dashboard/UI)
- `migrations/` — SQL migrations
- `scripts/` — Dev and utility scripts

## Hardware Setup

### Requirements

- ESP32 development board
- MFRC522 RFID reader module
- SSD1306 OLED display (128x64)
- Jumper wires

### Wiring

**RC522 RFID Reader**:
- SDA → ESP32 GPIO 5
- SCK → ESP32 GPIO 18
- MOSI → ESP32 GPIO 23
- MISO → ESP32 GPIO 19
- RST → ESP32 GPIO 4
- 3.3V → ESP32 3.3V
- GND → ESP32 GND

**SSD1306 OLED Display**:
- SDA → ESP32 GPIO 21
- SCL → ESP32 GPIO 22
- VCC → ESP32 3.3V
- GND → ESP32 GND

For detailed hardware setup instructions, see [esp32/README.md](./esp32/README.md).

## Configuration

### ESP32 Configuration

1. Copy the config template:
   ```bash
   cp esp32/CONFIG_TEMPLATE.h esp32/main/include/config.h
   ```

2. Edit `esp32/main/include/config.h`:
   ```c
   #define WIFI_SSID "YourWiFiNetwork"
   #define WIFI_PASSWORD "YourPassword"
   #define GATEWAY_URL "http://localhost:8080"
   #define ADMIN_API_URL "http://localhost:8001"
   #define DEVICE_TOKEN "your-device-token"
   #define DEVICE_ID "esp32-device-001"
   ```

### Gateway Configuration

Copy `gateway/env.example` and set:
- `PG_URL`: PostgreSQL connection string
- `DEVICE_TOKEN_SECRET`: Secret for token hashing
- `PORT`: Server port (default: 8080)

### Admin API Configuration

Copy `admin/env.example` and set:
- `PG_URL`: PostgreSQL connection string
- `CORS_ORIGINS`: Allowed frontend origins
- `PORT`: Server port (default: 8001)

### Database Setup

Run migrations:

```bash
# Using Docker Compose (automatic)
./scripts/dev.sh up

# Manual
psql -U postgres -d attendance -f migrations/attendance.sql
psql -U postgres -d attendance -f migrations/03-add-rfid-uid.sql
psql -U postgres -d attendance -f migrations/04-create-unassigned-rfid.sql
```

### Register Device Token

Generate SHA-256 hash of device token and insert into database:

```sql
INSERT INTO device_registry (device_id, device_type, token_hash)
VALUES ('esp32-device-001', 'esp32', 'sha256_hash_here');
```

## API Documentation

### Gateway Endpoints

- `POST /api/events` - Receive RFID events from ESP32
- `GET /health` - Health check

### Admin API Endpoints

**Students**:
- `GET /students` - List students (with search)
- `POST /students` - Create student
- `GET /students/by-rfid/{uid}` - Get student by RFID UID
- `POST /students/register-rfid` - Register RFID to student
- `DELETE /students/{admission_no}/rfid` - Remove RFID assignment

**Attendance**:
- `GET /attendance` - Query attendance records
- `GET /attendance/current` - Get students currently in library

**Unassigned RFID**:
- `GET /rfid/unassigned` - List unregistered RFID cards

**WebSocket**:
- `WS /ws/events` - Real-time event stream

## Deployment

### Production Setup

1. **Database**: Provision PostgreSQL (e.g., AWS RDS) and run migrations
2. **Gateway**: Build and deploy container from `gateway/Dockerfile`
3. **Admin API**: Build and deploy container from `admin/Dockerfile`
4. **Frontend**: Deploy to Vercel or similar platform

### Environment Variables

Set production environment variables:
- `PG_URL`: Production database URL
- `DEVICE_TOKEN_SECRET`: Strong random secret
- `CORS_ORIGINS`: Production frontend URL

### ESP32 Firmware

1. Update `esp32/main/include/config.h` with production URLs
2. Build and flash firmware:
   ```bash
   cd esp32
   idf.py set-target esp32
   idf.py build flash
   ```

For detailed deployment instructions, see the [Production Deployment](#production-deployment-cloudflare--aws) section in the original README.

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Detailed hardware and backend architecture
- **[PRESENTATION_SUMMARY.md](./PRESENTATION_SUMMARY.md)**: High-level overview for presentations
- **[esp32/README.md](./esp32/README.md)**: ESP32 hardware setup and firmware guide

## Security

- **Device Authentication**: SHA-256 hashed tokens stored in database
- **Idempotent Operations**: Duplicate events prevented via `event_id` uniqueness
- **Input Validation**: All inputs validated and sanitized
- **CORS Protection**: Configured allowed origins

## Troubleshooting

### ESP32 Not Connecting

- Check WiFi credentials in `config.h`
- Verify gateway URL is accessible
- Check device token is registered in database

### Events Not Appearing

- Check gateway logs for authentication errors
- Verify RFID card is registered to a student
- Check database connection

### Database Connection Issues

- Verify `PG_URL` is correct
- Check PostgreSQL is running
- Review migration status

## License

This project is not available for use, copying, modification, distribution, or any other exploitation. All rights reserved.

See the [`LICENSE`](./LICENSE) file for full terms.

---

For questions or issues, please open an issue on GitHub.
