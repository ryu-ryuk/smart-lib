"use client"

import { Search, Bell, LogOut, User } from "lucide-react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"

interface HeaderProps {
  currentPage: string
}

export default function Header({ currentPage }: HeaderProps) {
  const { data: session } = useSession()
  const router = useRouter()

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

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    localStorage.removeItem("isAuthenticated")
    router.push("/login")
  }

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
            disabled
            title="Search functionality coming soon"
          />
        </div>
        <button
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          title="Notifications (coming soon)"
        >
          <Bell className="w-5 h-5 text-muted-foreground hover:text-foreground" />
        </button>

        {/* User Info */}
        {session?.user && (
          <div className="flex items-center gap-3 pl-4 border-l border-white/10">
            <div className="flex items-center gap-2">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-accent" />
                </div>
              )}
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-foreground">{session.user.name}</p>
                <p className="text-xs text-muted-foreground">{session.user.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-5 h-5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
