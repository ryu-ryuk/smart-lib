"use client"

import { useState, useMemo, useEffect } from "react"
import { Search, Filter, CreditCard, Trash2 } from "lucide-react"
import { fetchStudents, registerRFID, removeRFID, type Student } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function StudentRecords() {
  const [students, setStudents] = useState<Student[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterDepartment, setFilterDepartment] = useState("all")
  const [sortBy, setSortBy] = useState("name")
  const [loading, setLoading] = useState(true)
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [rfidUid, setRfidUid] = useState("")
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [overrideAdmission, setOverrideAdmission] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    loadStudents()
  }, [])

  const loadStudents = async () => {
    try {
      setLoading(true)
      const data = await fetchStudents()
      setStudents(data)
    } catch (error) {
      console.error('Failed to load students:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterRFID = (student: Student) => {
    setSelectedStudent(student)
    setRfidUid("")
    setRegisterError(null)
    setOverrideAdmission(null)
    setRegisterDialogOpen(true)
  }

  const submitRFID = async (force = false) => {
    if (!selectedStudent || !rfidUid.trim()) {
      setRegisterError("Please enter RFID UID")
      return
    }

    setRegistering(true)
    setRegisterError(null)
    setOverrideAdmission(null)

    try {
      await registerRFID(selectedStudent.admission_no, rfidUid.trim(), { force })
      await loadStudents() // Refresh to show updated RFID
      setRegisterDialogOpen(false)
      setRfidUid("")
      setSelectedStudent(null)
      setOverrideAdmission(null)
    } catch (error: any) {
      const message = error?.message || "Failed to register RFID"
      const existingMatch = message.match(/RFID already registered to (.+)/i)
      if (existingMatch && !force) {
        const existingAdmission = existingMatch[1].trim()
        setOverrideAdmission(existingAdmission)
        setRegisterError(`This card is currently linked to ${existingAdmission}.`)
      } else {
        setRegisterError(message)
      }
    } finally {
      setRegistering(false)
    }
  }

  const handleSubmitRFID = () => submitRFID(false)

  const handleOverrideRFID = () => submitRFID(true)

  const handleRemoveRFID = async (student: Student) => {
    if (!student.rfid_uid) return
    const confirmed = window.confirm(
      `Remove RFID card ${student.rfid_uid} from ${student.name}?`
    )
    if (!confirmed) return

    try {
      setRemovingId(student.admission_no)
      await removeRFID(student.admission_no)
      await loadStudents()
    } catch (error) {
      console.error("Failed to remove RFID:", error)
      alert(error instanceof Error ? error.message : "Failed to remove RFID")
    } finally {
      setRemovingId(null)
    }
  }

  const departments = ["all", ...new Set(students.map((s) => s.branch).filter(Boolean) as string[])]

  const filteredStudents = useMemo(() => {
    const result = students.filter((student) => {
      const matchesSearch =
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.admission_no.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesDepartment = filterDepartment === "all" || student.branch === filterDepartment

      return matchesSearch && matchesDepartment
    })

    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "id":
          return a.admission_no.localeCompare(b.admission_no)
        default:
          return 0
      }
    })

    return result
  }, [students, searchTerm, filterDepartment, sortBy])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading students...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Filters */}
      <div className="space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or admission number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Departments</option>
              {departments.slice(1).map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="name">Sort by Name</option>
              <option value="id">Sort by ID</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="stat-card">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Admission No</th>
                <th>Name</th>
                <th>Branch</th>
                <th>Year</th>
                <th>RFID UID</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-8">
                    No students found
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.admission_no}>
                    <td className="font-mono text-sm">{student.admission_no}</td>
                    <td className="font-medium">{student.name}</td>
                    <td>{student.branch || "-"}</td>
                    <td>{student.year || "-"}</td>
                    <td className="font-mono text-sm text-foreground">
                      {student.rfid_uid || <span className="text-muted-foreground">Not linked</span>}
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => handleRegisterRFID(student)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-card transition-colors"
                        title="Register/Update RFID Card"
                      >
                        <CreditCard className="w-4 h-4 text-muted-foreground hover:text-accent" />
                      </button>
                      {student.rfid_uid && (
                        <button
                          onClick={() => handleRemoveRFID(student)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-card transition-colors ml-1 disabled:opacity-50"
                          title="Remove RFID Card"
                          disabled={removingId === student.admission_no}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-400" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredStudents.length} of {students.length} students
        </div>
      </div>

      {/* Register RFID Dialog */}
      <Dialog open={registerDialogOpen} onOpenChange={setRegisterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register RFID Card</DialogTitle>
            <DialogDescription>
              Register or update RFID card for {selectedStudent?.name} ({selectedStudent?.admission_no})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">RFID UID</label>
              <Input
                type="text"
                placeholder="Enter RFID UID (e.g., A1B2C3D4)"
                value={rfidUid}
                onChange={(e) => setRfidUid(e.target.value.toUpperCase())}
                className="font-mono"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Scan or type the RFID card UID (hex format)
              </p>
            </div>
            {registerError && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-sm text-red-400">
                {registerError}
              </div>
            )}
            {overrideAdmission && (
              <div className="flex items-center justify-between gap-3 p-3 bg-yellow-500/20 border border-yellow-500/40 rounded">
                <span className="text-sm text-yellow-200">
                  Override will unlink the card from {overrideAdmission} and assign it to this student.
                </span>
                <Button variant="secondary" onClick={handleOverrideRFID} disabled={registering}>
                  {registering ? "Overriding..." : "Override"}
                </Button>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setRegisterDialogOpen(false)}
                disabled={registering}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitRFID}
                disabled={registering || !rfidUid.trim()}
              >
                {registering ? "Registering..." : "Register RFID"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
