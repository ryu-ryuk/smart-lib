# Attendance Stack (ESP32 + RFID)

Quick setup notes for running the whole project locally.

## Prerequisites
- Docker with Compose (desktop app or CLI plugin)
- Node.js 18+
- Python 3.10+
- Go 1.22+

## One-Command Dev Environment
```bash
./scripts/dev.sh up
```

The script will:
- boot PostgreSQL in Docker and run migrations
- start the Python Admin API on `http://localhost:8001`
- start the Go gateway on `http://localhost:8080`
- launch the Next.js frontend on `http://localhost:3000`

Press `Ctrl+C` to stop everything. To stop without starting first:
```bash
./scripts/dev.sh down
```

## Registering a New RFID Tag
- Scan the tag with the ESP32 and note the UID from the logs (e.g. `E44E6A05C5`).
- Link it to a student using the helper script:
```bash
npm run register-rfid -- --admission 24GCE24001 --rfid E44E6A05C5
```
- The gateway will accept future scans once the mapping exists.

## Student Imports
If you need to load the class CSV:
```bash
node scripts/import-students-from-csv.js path/to/file.csv
```

Make sure PostgreSQL is already running (`./scripts/dev.sh up`).


## Production Deployment (Cloudflare + AWS)

1. **Provision infrastructure**
   - Run Postgres (e.g. AWS RDS) and apply the SQL in `migrations/`.
   - Deploy the Go gateway container built from `gateway/Dockerfile` (any container host works).
   - Deploy the FastAPI service container built from `admin/Dockerfile`.

2. **Configure environment**
   - Copy `gateway/env.example` and `admin/env.example` to real environment files, then inject them (ECS task definition, Systemd unit, etc.).
   - Use the same `PG_URL` for both services.
   - Generate a long random string for `DEVICE_TOKEN_SECRET` and seed `device_registry.token_hash` with SHA-256 hashes of device tokens.
   - Allow origins for the frontend in `CORS_ORIGINS`.

3. **Set up Cloudflare**
   - Point `esp.alokranjan.me` to the backend load balancer/IP (enable the orange-cloud proxy).
   - Point `lib.alokranjan.me` to the Vercel deployment.
   - Terminate TLS at Cloudflare; the origin only needs to accept Cloudflare traffic.
   - Reverse proxy `/api/events` to the Go gateway and `/admin/*` to the FastAPI service.

4. **Frontend configuration**
   - In Vercel, set `NEXT_PUBLIC_API_URL=https://esp.alokranjan.me/admin` and `NEXT_PUBLIC_WS_URL=wss://esp.alokranjan.me/admin/ws/events`.
   - Redeploy so API calls and WebSocket streams target the Cloudflare domain.

5. **ESP32 firmware**
   - Copy `esp32/CONFIG_TEMPLATE.h` to `esp32/main/include/config.h`.
   - Fill in Wi-Fi credentials, `DEVICE_ID`, and the plain `DEVICE_TOKEN`.
   - Flash the firmware; it will POST to `https://esp.alokranjan.me/api/events` and fetch student data from `https://esp.alokranjan.me/admin`.

6. **Post-deploy checks**
   - Hit `https://esp.alokranjan.me/admin/health` to verify the API is live.
   - Scan a tag and confirm it appears in the admin dashboard on `https://lib.alokranjan.me`.

