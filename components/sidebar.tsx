"use client"

import { BookOpen, Users, BarChart3, LogOut } from "lucide-react"
import Link from "next/link"

interface SidebarProps {
  currentPage: string
  onPageChange: (page: string) => void
}

export default function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "students", label: "Student Records", icon: Users },
    { id: "books", label: "Book Management", icon: BookOpen },
  ]

  return (
    <aside className="w-64 glass-effect border-r border-white/10 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <Link href="/landing" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 bg-gradient-to-br from-accent to-accent/60 rounded-lg flex items-center justify-center shadow-lg">
            <BookOpen className="w-6 h-6 text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Smart Library</h1>
            <p className="text-xs text-muted-foreground">Management System</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`sidebar-nav-item flex items-center gap-3 w-full ${isActive ? "active" : ""}`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 space-y-4">
        <Link
          href="/landing"
          className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5 text-muted-foreground hover:text-foreground w-full"
        >
          <LogOut className="w-5 h-5" />
          <span>Exit System</span>
        </Link>
        <p className="text-xs text-muted-foreground text-center">v1.0.0</p>
      </div>
    </aside>
  )
}
