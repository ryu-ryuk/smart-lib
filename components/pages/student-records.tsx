"use client"

import { useState, useMemo } from "react"
import { Search, Filter, MoreHorizontal } from "lucide-react"
import { mockStudents } from "@/lib/mock-data"

export default function StudentRecords() {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterDepartment, setFilterDepartment] = useState("all")
  const [sortBy, setSortBy] = useState("name")

  const departments = ["all", ...new Set(mockStudents.map((s) => s.department))]

  const filteredStudents = useMemo(() => {
    const result = mockStudents.filter((student) => {
      const matchesSearch =
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.email.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus = filterStatus === "all" || student.status === filterStatus
      const matchesDepartment = filterDepartment === "all" || student.department === filterDepartment

      return matchesSearch && matchesStatus && matchesDepartment
    })

    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "id":
          return a.studentId.localeCompare(b.studentId)
        case "books":
          return b.booksBorrowed - a.booksBorrowed
        default:
          return 0
      }
    })

    return result
  }, [searchTerm, filterStatus, filterDepartment, sortBy])

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
                placeholder="Search by name, ID, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

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
            <option value="books">Sort by Books Borrowed</option>
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="stat-card">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Status</th>
                <th>Books Borrowed</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, idx) => (
                <tr key={idx}>
                  <td className="font-mono text-sm">{student.studentId}</td>
                  <td className="font-medium">{student.name}</td>
                  <td className="text-muted-foreground">{student.email}</td>
                  <td>{student.department}</td>
                  <td>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${student.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                        }`}
                    >
                      {student.status}
                    </span>
                  </td>
                  <td className="font-semibold">{student.booksBorrowed}</td>
                  <td className="text-center">
                    <button className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-card transition-colors">
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredStudents.length} of {mockStudents.length} students
        </div>
      </div>
    </div>
  )
}
