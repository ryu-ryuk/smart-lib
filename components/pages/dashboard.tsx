"use client"

import { mockAttendanceData } from "@/lib/mock-data"

export default function Dashboard() {
  const stats = [
    { label: "Total Students", value: "342", icon: "👥", color: "from-blue-500 to-blue-600" },
    { label: "Books Borrowed", value: "156", icon: "📚", color: "from-green-500 to-green-600" },
    { label: "Today's Check-ins", value: "48", icon: "⏰", color: "from-orange-500 to-orange-600" },
    { label: "Active Loans", value: "89", icon: "📈", color: "from-purple-500 to-purple-600" },
  ]

  return (
    <div className="p-8 space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => {
          return (
            <div key={idx} className="stat-card hover:bg-white/8 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                </div>
                <div className="glass-effect-sm p-3 rounded-lg text-2xl shadow-lg ring-1 ring-white/5">
                  {stat.icon}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Simple Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card">
          <h3 className="text-lg font-semibold text-foreground mb-4">Weekly Attendance Trend</h3>
          <div className="space-y-4">
            {[
              { day: "Mon", checkIns: 45 },
              { day: "Tue", checkIns: 52 },
              { day: "Wed", checkIns: 48 },
              { day: "Thu", checkIns: 61 },
              { day: "Fri", checkIns: 55 },
            ].map((item) => (
              <div key={item.day} className="flex items-center gap-3">
                <span className="w-12 text-sm font-medium text-muted-foreground">{item.day}</span>
                <div className="flex-1 bg-white/5 rounded h-8 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-accent to-accent/60 h-full transition-all"
                    style={{ width: `${(item.checkIns / 61) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-muted-foreground text-right">{item.checkIns}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stat-card">
          <h3 className="text-lg font-semibold text-foreground mb-4">Book Status Distribution</h3>
          <div className="space-y-4">
            {[
              { name: "Available", value: 245, color: "from-green-500 to-green-600" },
              { name: "Borrowed", value: 156, color: "from-orange-500 to-orange-600" },
              { name: "Reserved", value: 32, color: "from-purple-500 to-purple-600" },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="w-20 text-sm font-medium text-muted-foreground">{item.name}</span>
                <div className="flex-1 bg-white/5 rounded h-8 overflow-hidden">
                  <div
                    className={`bg-gradient-to-r ${item.color} h-full transition-all`}
                    style={{ width: `${(item.value / 245) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-muted-foreground text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="stat-card border-l-4 border-l-orange-500">
          <div className="flex items-start gap-4">
            <span className="text-2xl flex-shrink-0 mt-1">⚠️</span>
            <div>
              <h4 className="font-semibold text-foreground mb-1">Overdue Books</h4>
              <p className="text-sm text-muted-foreground mb-2">12 books are overdue for return</p>
              <button className="text-sm text-accent hover:text-accent/80 transition-colors">View Details →</button>
            </div>
          </div>
        </div>

        <div className="stat-card border-l-4 border-l-red-500">
          <div className="flex items-start gap-4">
            <span className="text-2xl flex-shrink-0 mt-1">🔴</span>
            <div>
              <h4 className="font-semibold text-foreground mb-1">Low Inventory</h4>
              <p className="text-sm text-muted-foreground mb-2">5 popular books have less than 2 copies</p>
              <button className="text-sm text-accent hover:text-accent/80 transition-colors">View Details →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Attendance */}
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
              {mockAttendanceData.slice(0, 8).map((log, idx) => (
                <tr key={idx}>
                  <td className="font-mono text-sm text-foreground">{log.studentId}</td>
                  <td className="text-foreground">{log.name}</td>
                  <td className="text-foreground">{log.checkInTime}</td>
                  <td>
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
