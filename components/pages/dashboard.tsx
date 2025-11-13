"use client"

import { useEffect, useMemo, useState } from "react"
import { Users, Clock, AlertTriangle } from "lucide-react"
import {
  fetchAttendance,
  fetchStudents,
  fetchUnassignedRFIDs,
  registerRFID,
  AttendanceWebSocket,
  type AttendanceRecord,
  type Student,
  type UnassignedRFID,
} from "@/lib/api"
let wsClient: AttendanceWebSocket | null = null

export default function Dashboard() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [unassignedRFIDs, setUnassignedRFIDs] = useState<UnassignedRFID[]>([])
  const [stats, setStats] = useState({
    totalStudents: 0,
    todayCheckIns: 0,
  })
  const [loading, setLoading] = useState(true)
  const [unassignedLoading, setUnassignedLoading] = useState(false)
  const [assignInputs, setAssignInputs] = useState<Record<string, string>>({})
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({})
  const [assignStatus, setAssignStatus] = useState<Record<string, string>>({})
  const [assigningUid, setAssigningUid] = useState<string | null>(null)

  const handlePageChange = (page: string) => {
    if (typeof window !== "undefined") {
      const event = new CustomEvent("pageChange", { detail: page })
      window.dispatchEvent(event)
    }
  }

  useEffect(() => {
    loadData()

    if (typeof window !== "undefined") {
      wsClient = new AttendanceWebSocket()
      wsClient.connect()

      const unsubscribe = wsClient.onEvent(() => {
        loadAttendance(true)
        loadUnassigned()
      })

      return () => {
        unsubscribe()
        wsClient?.disconnect()
      }
    }
  }, [])

  const calculateTodayCheckIns = (records: AttendanceRecord[]) => {
    const today = new Date().toISOString().split("T")[0]
    return records.filter((record) => {
      if (!record.ts) return false
      const normalized = new Date(record.ts).toISOString().split("T")[0]
      return normalized === today && record.event_type === "entry" && record.admission_no !== "UNKNOWN"
    }).length
  }

  const loadUnassigned = async (initial?: UnassignedRFID[]) => {
    if (initial) {
      setUnassignedRFIDs(initial)
      return
    }
    try {
      setUnassignedLoading(true)
      const data = await fetchUnassignedRFIDs()
      setUnassignedRFIDs(data)
    } catch (error) {
      console.error("Failed to load unassigned RFID tags:", error)
    } finally {
      setUnassignedLoading(false)
    }
  }

  const loadStudents = async (initial?: Student[]) => {
    if (initial) {
      setStudents(initial)
      setStats((prev) => ({
        ...prev,
        totalStudents: initial.length,
      }))
      return
    }
    try {
      const data = await fetchStudents()
      setStudents(data)
      setStats((prev) => ({
        ...prev,
        totalStudents: data.length,
      }))
    } catch (error) {
      console.error("Failed to load students:", error)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const [attendanceData, studentsData, unassignedData] = await Promise.all([
        fetchAttendance({ limit: 8 }),
        fetchStudents(),
        fetchUnassignedRFIDs(),
      ])
      setAttendance(attendanceData)
      loadStudents(studentsData)
      setStats({
        totalStudents: studentsData.length,
        todayCheckIns: calculateTodayCheckIns(attendanceData),
      })
      loadUnassigned(unassignedData)
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadAttendance = async (skipLoader = false) => {
    try {
      if (!skipLoader) {
        setLoading(true)
      }
      const data = await fetchAttendance({ limit: 8 })
      setAttendance(data)
      setStats((prev) => ({
        ...prev,
        todayCheckIns: calculateTodayCheckIns(data),
      }))
    } catch (error) {
      console.error("Failed to load attendance:", error)
    } finally {
      if (!skipLoader) {
        setLoading(false)
      }
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const diff = Date.now() - date.getTime()
    const seconds = Math.max(0, Math.floor(diff / 1000))
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const statCards = [
    { label: "Total Students", value: stats.totalStudents.toString(), Icon: Users, color: "from-blue-500 to-blue-600" },
    { label: "Today's Check-ins", value: stats.todayCheckIns.toString(), Icon: Clock, color: "from-orange-500 to-orange-600" },
    { label: "Unassigned RFID Tags", value: unassignedRFIDs.length.toString(), Icon: AlertTriangle, color: "from-purple-500 to-purple-600" },
  ]

  const allStudentsDatalist = useMemo(() => {
    return students.map((student) => ({
      value: student.admission_no,
      label: `${student.admission_no} — ${student.name}`,
    }))
  }, [students])

  const handleAssign = async (rfid_uid: string) => {
    const admissionNo = (assignInputs[rfid_uid] || "").trim()
    if (!admissionNo) {
      setAssignErrors((prev) => ({ ...prev, [rfid_uid]: "Select or enter a student admission number." }))
      return
    }
    try {
      setAssigningUid(rfid_uid)
      setAssignErrors((prev) => ({ ...prev, [rfid_uid]: "" }))
      await registerRFID(admissionNo, rfid_uid)
      setAssignStatus((prev) => ({ ...prev, [rfid_uid]: `Assigned to ${admissionNo}` }))
      setAssignInputs((prev) => ({ ...prev, [rfid_uid]: "" }))
      await Promise.all([loadUnassigned(), loadStudents(), loadAttendance()])
    } catch (error) {
      setAssignStatus((prev) => ({ ...prev, [rfid_uid]: "" }))
      setAssignErrors((prev) => ({
        ...prev,
        [rfid_uid]: error instanceof Error ? error.message : "Failed to link RFID card.",
      }))
    } finally {
      setAssigningUid(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Unassigned RFID Tags</h3>
            <p className="text-sm text-muted-foreground">
              Newly detected cards that are not linked to a student yet.
            </p>
          </div>
          <button
            onClick={() => loadUnassigned()}
            className="text-sm text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
            disabled={unassignedLoading}
          >
            {unassignedLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {unassignedRFIDs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No unassigned RFID tags. Scan a new card to populate this list.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>UID</th>
                  <th>Last seen</th>
                  <th>Scans</th>
                  <th>Assign to student</th>
                </tr>
              </thead>
              <tbody>
                {unassignedRFIDs.map((tag) => {
                  const datalistId = `students-${tag.rfid_uid}`
                  return (
                    <tr key={tag.rfid_uid}>
                      <td className="font-mono text-sm text-foreground">{tag.rfid_uid}</td>
                      <td className="text-foreground">
                        <div className="flex flex-col">
                          <span>{formatRelativeTime(tag.last_seen)}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(tag.last_seen).toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="text-foreground">{tag.seen_count}</td>
                      <td>
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2 flex-wrap">
                            <input
                              list={datalistId}
                              placeholder="Select or type admission no."
                              value={assignInputs[tag.rfid_uid] || ""}
                              onChange={(e) => {
                                const value = e.target.value
                                setAssignInputs((prev) => ({ ...prev, [tag.rfid_uid]: value }))
                                setAssignErrors((prev) => ({ ...prev, [tag.rfid_uid]: "" }))
                                setAssignStatus((prev) => ({ ...prev, [tag.rfid_uid]: "" }))
                              }}
                              className="glass-effect-sm px-3 py-2 text-sm min-w-[14rem]"
                            />
                            <datalist id={datalistId}>
                              {allStudentsDatalist.map((item) => (
                                <option key={`${datalistId}-${item.value}`} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </datalist>
                            <button
                              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg disabled:opacity-50"
                              onClick={() => handleAssign(tag.rfid_uid)}
                              disabled={assigningUid === tag.rfid_uid}
                            >
                              {assigningUid === tag.rfid_uid ? "Assigning..." : "Assign"}
                            </button>
                          </div>
                          {assignErrors[tag.rfid_uid] && (
                            <span className="text-xs text-red-500">{assignErrors[tag.rfid_uid]}</span>
                          )}
                          {assignStatus[tag.rfid_uid] && (
                            <span className="text-xs text-green-500">{assignStatus[tag.rfid_uid]}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, idx) => (
          <div key={idx} className="stat-card hover:bg-white/8 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">{stat.label}</p>
                <p className="text-3xl font-bold text-foreground">{stat.value}</p>
              </div>
              <div className="glass-effect-sm p-3 rounded-lg shadow-lg ring-1 ring-white/5">
                <stat.Icon className="w-6 h-6 text-foreground" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="stat-card">
        <h3 className="text-lg font-semibold text-foreground mb-4">Recent Attendance Logs</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Check-in Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-8">
                    No attendance records yet
                  </td>
                </tr>
              ) : (
                attendance.map((record) => (
                  <tr key={record.id}>
                    <td className="font-mono text-sm text-foreground">{record.admission_no}</td>
                    <td className="text-foreground">{record.name || "Unknown"}</td>
                    <td className="text-foreground">{formatTime(record.ts)}</td>
                    <td>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                          record.event_type === "entry"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-orange-500/20 text-orange-400"
                        }`}
                      >
                        {record.event_type === "entry" ? "Checked In" : "Checked Out"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
