const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
// Derive WS URL from API URL if not explicitly set
const getWSUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  // Convert http:// to ws:// and https:// to wss://
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
  return apiUrl.replace(/^http/, 'ws') + '/ws/events';
};
const WS_URL = getWSUrl();

export interface Student {
  admission_no: string;
  name: string;
  branch?: string;
  year?: number;
  created_at?: string;
  rfid_uid?: string | null;
}

export interface AttendanceRecord {
  id: number;
  admission_no: string;
  event_type: 'entry' | 'exit';
  ts: string;
  device_id?: string;
  name?: string;
}

export interface AttendanceEvent {
  type: string;
  event_id: string;
  admission_no: string;
  event_type: 'entry' | 'exit';
  ts: string;
  device_id?: string;
}

// API Client
export async function fetchStudents(search?: string): Promise<Student[]> {
  const url = search 
    ? `${API_URL}/students?search=${encodeURIComponent(search)}`
    : `${API_URL}/students`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch students');
  return res.json();
}

export async function createStudent(student: {
  admission_no: string;
  name: string;
  branch?: string;
  year?: number;
}): Promise<{ status: string; admission_no: string }> {
  const res = await fetch(`${API_URL}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(student),
  });
  if (!res.ok) throw new Error('Failed to create student');
  return res.json();
}

export async function registerRFID(admission_no: string, rfid_uid: string): Promise<{ status: string; admission_no: string; rfid_uid: string }> {
  const res = await fetch(`${API_URL}/students/register-rfid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ admission_no, rfid_uid: rfid_uid.toUpperCase().trim() }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Failed to register RFID' }));
    throw new Error(error.detail || 'Failed to register RFID');
  }
  return res.json();
}

export async function fetchAttendance(params?: {
  date?: string;
  admission_no?: string;
  limit?: number;
}): Promise<AttendanceRecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.date) searchParams.set('date', params.date);
  if (params?.admission_no) searchParams.set('admission_no', params.admission_no);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  
  const res = await fetch(`${API_URL}/attendance?${searchParams}`);
  if (!res.ok) throw new Error('Failed to fetch attendance');
  return res.json();
}

export async function getStats(): Promise<{
  totalStudents: number;
  todayCheckIns: number;
}> {
  const [students, attendance] = await Promise.all([
    fetchStudents(),
    fetchAttendance({ limit: 1000 }),
  ]);

  const today = new Date().toISOString().split('T')[0];
  const todayCheckIns = attendance.filter(
    (record) => record.ts.startsWith(today) && record.event_type === 'entry'
  ).length;

  return {
    totalStudents: students.length,
    todayCheckIns,
  };
}

export interface UnassignedRFID {
  rfid_uid: string;
  first_seen: string;
  last_seen: string;
  seen_count: number;
  device_id?: string;
  last_event?: Record<string, unknown> | null;
}

export async function fetchUnassignedRFIDs(): Promise<UnassignedRFID[]> {
  const res = await fetch(`${API_URL}/rfid/unassigned`);
  if (!res.ok) throw new Error("Failed to fetch unassigned RFID tags");
  return res.json();
}

// WebSocket Connection
export class AttendanceWebSocket {
  private ws: WebSocket | null = null;
  private listeners: Set<(event: AttendanceEvent) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data: AttendanceEvent = JSON.parse(event.data);
          this.listeners.forEach((listener) => listener(data));
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      this.ws.onerror = (error) => {
        // Only log errors if we haven't exceeded max attempts
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          console.warn('WebSocket connection error (will retry):', WS_URL);
        }
      };

      this.ws.onclose = () => {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = 1000 * this.reconnectAttempts;
          console.log(`WebSocket disconnected, reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        } else {
          console.warn('WebSocket: Max reconnection attempts reached. API may not be running.');
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }

  onEvent(listener: (event: AttendanceEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

