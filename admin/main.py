from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import json

# Try asyncpg first, fallback to psycopg2
try:
    import asyncpg
    USE_ASYNC = True
except ImportError:
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        USE_ASYNC = False
    except ImportError:
        print("ERROR: Need either asyncpg or psycopg2-binary")
        print("Install with: pip install psycopg2-binary")
        raise

from contextlib import asynccontextmanager

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Database connection pool
db_pool = None
db_conn = None

def get_db_connection():
    global db_conn
    if db_conn is None or (hasattr(db_conn, 'closed') and db_conn.closed):
        pg_url = os.getenv("PG_URL", "postgresql://attendance_user:dev_password_123@localhost:5432/attendance")
        if pg_url.startswith("postgres://"):
            pg_url = pg_url.replace("postgres://", "postgresql://", 1)
        db_conn = psycopg2.connect(pg_url)
    return db_conn

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, db_conn
    pg_url = os.getenv("PG_URL", "postgresql://attendance_user:dev_password_123@localhost:5432/attendance")
    
    if USE_ASYNC:
        db_pool = await asyncpg.create_pool(pg_url)
    else:
        # Sync connection for psycopg2 (prefers postgresql://)
        if pg_url.startswith("postgres://"):
            pg_url = pg_url.replace("postgres://", "postgresql://", 1)
        db_conn = psycopg2.connect(pg_url)
    
    yield
    
    if USE_ASYNC and db_pool:
        await db_pool.close()
    elif db_conn:
        db_conn.close()

app = FastAPI(lifespan=lifespan)

# CORS - configure for your Vercel domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class StudentCreate(BaseModel):
    admission_no: str
    name: str
    branch: Optional[str] = None
    year: Optional[int] = None

class Student(BaseModel):
    admission_no: str
    name: str
    branch: Optional[str]
    year: Optional[int]
    created_at: datetime

class AttendanceRecord(BaseModel):
    id: int
    admission_no: str
    event_type: str
    ts: datetime
    device_id: Optional[str]

class AttendanceQuery(BaseModel):
    date: Optional[str] = None
    admission_no: Optional[str] = None
    limit: int = 100

class InternalEvent(BaseModel):
    event_id: str
    device_id: str
    admission_no: str
    event_type: str
    ts: str

class UnassignedRFID(BaseModel):
    rfid_uid: str
    first_seen: datetime
    last_seen: datetime
    seen_count: int
    device_id: Optional[str] = None
    last_event: Optional[dict] = None

# Routes
@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/students")
async def list_students(search: Optional[str] = None):
    if USE_ASYNC:
        conn = await db_pool.acquire()
        try:
            if search:
                rows = await conn.fetch(
                    "SELECT admission_no, name, branch, year, created_at, rfid_uid FROM students WHERE admission_no ILIKE $1 OR name ILIKE $1 LIMIT 100",
                    f"%{search}%"
                )
            else:
                rows = await conn.fetch(
                    "SELECT admission_no, name, branch, year, created_at, rfid_uid FROM students ORDER BY created_at DESC LIMIT 100"
                )
            return [dict(row) for row in rows]
        finally:
            await db_pool.release(conn)
    else:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            if search:
                cur.execute(
                    "SELECT admission_no, name, branch, year, created_at, rfid_uid FROM students WHERE admission_no ILIKE %s OR name ILIKE %s LIMIT 100",
                    (f"%{search}%", f"%{search}%")
                )
            else:
                cur.execute(
                    "SELECT admission_no, name, branch, year, created_at, rfid_uid FROM students ORDER BY created_at DESC LIMIT 100"
                )
            return [dict(row) for row in cur.fetchall()]
        finally:
            cur.close()

@app.get("/students/by-rfid/{rfid_uid}")
async def student_by_rfid(rfid_uid: str):
    uid = rfid_uid.strip().upper()
    if not uid:
        raise HTTPException(status_code=400, detail="rfid_uid required")

    if USE_ASYNC:
        conn = await db_pool.acquire()
        try:
            row = await conn.fetchrow(
                """SELECT s.admission_no, s.name, s.branch, s.year,
                          CASE WHEN st.last_event_type = 'entry' THEN 'exit' ELSE 'entry' END AS next_event_type
                   FROM students s
                   LEFT JOIN attendance_state st ON st.admission_no = s.admission_no
                   WHERE s.rfid_uid = $1""",
                uid,
            )
            if not row:
                raise HTTPException(status_code=404, detail="Student not found")
            return dict(row)
        finally:
            await db_pool.release(conn)
    else:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(
                """SELECT s.admission_no, s.name, s.branch, s.year,
                          CASE WHEN st.last_event_type = 'entry' THEN 'exit' ELSE 'entry' END AS next_event_type
                   FROM students s
                   LEFT JOIN attendance_state st ON st.admission_no = s.admission_no
                   WHERE s.rfid_uid = %s""",
                (uid,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Student not found")
            return row
        finally:
            cur.close()

@app.get("/rfid/unassigned")
async def list_unassigned_rfid(limit: int = 100):
    limit = max(1, min(limit, 500))
    if USE_ASYNC:
        conn = await db_pool.acquire()
        try:
            rows = await conn.fetch(
                "SELECT rfid_uid, first_seen, last_seen, seen_count, device_id, last_event FROM rfid_unassigned ORDER BY last_seen DESC LIMIT $1",
                limit
            )
            result = []
            for row in rows:
                data = dict(row)
                # asyncpg returns JSONB as str or dict depending on config
                payload = data.get("last_event")
                if isinstance(payload, str):
                    try:
                        data["last_event"] = json.loads(payload)
                    except json.JSONDecodeError:
                        data["last_event"] = None
                result.append(data)
            return result
        finally:
            await db_pool.release(conn)
    else:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(
                "SELECT rfid_uid, first_seen, last_seen, seen_count, device_id, last_event FROM rfid_unassigned ORDER BY last_seen DESC LIMIT %s",
                (limit,)
            )
            rows = cur.fetchall()
            for row in rows:
                payload = row.get("last_event")
                if isinstance(payload, str):
                    try:
                        row["last_event"] = json.loads(payload)
                    except json.JSONDecodeError:
                        row["last_event"] = None
            return rows
        finally:
            cur.close()

@app.post("/students/register-rfid")
async def register_rfid(data: dict):
    """Register an RFID UID to a student"""
    admission_no = data.get("admission_no")
    rfid_uid = data.get("rfid_uid", "").upper().strip()  # Normalize to uppercase
    
    if not admission_no or not rfid_uid:
        raise HTTPException(status_code=400, detail="admission_no and rfid_uid required")
    
    if USE_ASYNC:
        conn = await db_pool.acquire()
        try:
            # Check if RFID is already registered to another student
            existing = await conn.fetchrow(
                "SELECT admission_no FROM students WHERE rfid_uid = $1 AND admission_no != $2",
                rfid_uid, admission_no
            )
            if existing:
                raise HTTPException(status_code=400, detail=f"RFID already registered to {existing['admission_no']}")
            
            # Update student with RFID UID
            await conn.execute(
                "UPDATE students SET rfid_uid = $1 WHERE admission_no = $2",
                rfid_uid, admission_no
            )
            await conn.execute(
                "DELETE FROM rfid_unassigned WHERE rfid_uid = $1",
                rfid_uid
            )
            return {"status": "registered", "admission_no": admission_no, "rfid_uid": rfid_uid}
        finally:
            await db_pool.release(conn)
    else:
        conn = get_db_connection()
        cur = conn.cursor()
        try:
            # Check if RFID is already registered
            cur.execute(
                "SELECT admission_no FROM students WHERE rfid_uid = %s AND admission_no != %s",
                (rfid_uid, admission_no)
            )
            existing = cur.fetchone()
            if existing:
                conn.rollback()
                raise HTTPException(status_code=400, detail=f"RFID already registered to {existing[0]}")
            
            # Update student with RFID UID
            cur.execute(
                "UPDATE students SET rfid_uid = %s WHERE admission_no = %s",
                (rfid_uid, admission_no)
            )
            cur.execute(
                "DELETE FROM rfid_unassigned WHERE rfid_uid = %s",
                (rfid_uid,)
            )
            conn.commit()
            return {"status": "registered", "admission_no": admission_no, "rfid_uid": rfid_uid}
        except HTTPException:
            raise
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            cur.close()

@app.post("/students")
async def create_student(student: StudentCreate):
    if USE_ASYNC:
        conn = await db_pool.acquire()
        try:
            await conn.execute(
                "INSERT INTO students (admission_no, name, branch, year) VALUES ($1, $2, $3, $4) ON CONFLICT (admission_no) DO UPDATE SET name = $2, branch = $3, year = $4",
                student.admission_no, student.name, student.branch, student.year
            )
            return {"status": "created", "admission_no": student.admission_no}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            await db_pool.release(conn)
    else:
        conn = get_db_connection()
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO students (admission_no, name, branch, year) VALUES (%s, %s, %s, %s) ON CONFLICT (admission_no) DO UPDATE SET name = %s, branch = %s, year = %s",
                (student.admission_no, student.name, student.branch, student.year, student.name, student.branch, student.year)
            )
            conn.commit()
            return {"status": "created", "admission_no": student.admission_no}
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            cur.close()

@app.get("/attendance")
async def get_attendance(date: Optional[str] = None, admission_no: Optional[str] = None, limit: int = 100):
    if USE_ASYNC:
        conn = await db_pool.acquire()
        try:
            query = "SELECT a.id, a.admission_no, a.event_type, a.ts, a.device_id, s.name FROM attendance a LEFT JOIN students s ON a.admission_no = s.admission_no WHERE 1=1"
            params = []
            param_count = 0

            if date:
                param_count += 1
                query += f" AND DATE(a.ts) = ${param_count}"
                params.append(date)

            if admission_no:
                param_count += 1
                query += f" AND a.admission_no = ${param_count}"
                params.append(admission_no)

            query += f" ORDER BY a.ts DESC LIMIT ${param_count + 1}"
            params.append(limit)

            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
        finally:
            await db_pool.release(conn)
    else:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            query = "SELECT a.id, a.admission_no, a.event_type, a.ts, a.device_id, s.name FROM attendance a LEFT JOIN students s ON a.admission_no = s.admission_no WHERE 1=1"
            params = []

            if date:
                query += " AND DATE(a.ts) = %s"
                params.append(date)

            if admission_no:
                query += " AND a.admission_no = %s"
                params.append(admission_no)

            query += " ORDER BY a.ts DESC LIMIT %s"
            params.append(limit)

            cur.execute(query, params)
            results = []
            for row in cur.fetchall():
                row_dict = dict(row)
                # Ensure all expected fields are present
                if 'name' not in row_dict:
                    row_dict['name'] = None
                if 'device_id' not in row_dict:
                    row_dict['device_id'] = None
                results.append(row_dict)
            return results
        finally:
            cur.close()

@app.post("/internal/events")
async def internal_event(event: InternalEvent):
    """Gateway calls this to broadcast events to WebSocket clients"""
    await manager.broadcast({
        "type": "attendance_event",
        "event_id": event.event_id,
        "admission_no": event.admission_no,
        "event_type": event.event_type,
        "ts": event.ts,
        "device_id": event.device_id,
    })
    return {"status": "broadcasted"}

@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))

