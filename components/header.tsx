"use client"

import { Search, Bell } from "lucide-react"

interface HeaderProps {
  currentPage: string
}

export default function Header({ currentPage }: HeaderProps) {
  const pageTitle =
    {
      dashboard: "Dashboard",
      students: "Student Records",
      books: "Book Management",
    }[currentPage] || "Dashboard"

  const pageDescription =
    {
      dashboard: "Real-time library analytics and attendance overview",
      students: "Manage and search student records",
      books: "Track and manage book inventory",
    }[currentPage] || "Manage your library efficiently"

  return (
    <header className="glass-effect border-b border-white/10 px-8 py-6 flex items-center justify-between">
      <div>
        <h2 className="text-3xl font-bold text-foreground">{pageTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{pageDescription}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="pl-10 pr-4 py-2 glass-effect-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    </header>
  )
}
