"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useState } from "react"
import { useSession } from "next-auth/react"
import Sidebar from "@/components/sidebar"
import Header from "@/components/header"
import Dashboard from "@/components/pages/dashboard"
import StudentRecords from "@/components/pages/student-records"
import BookManagement from "@/components/pages/book-management"

export default function DashboardApp() {
    const [currentPage, setCurrentPage] = useState("dashboard")
    const { data: session, status } = useSession()
    const router = useRouter()

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login")
        }
    }, [status, router])

    useEffect(() => {
        const handlePageChange = (e: CustomEvent) => {
            setCurrentPage(e.detail)
        }
        window.addEventListener('pageChange', handlePageChange as EventListener)
        return () => {
            window.removeEventListener('pageChange', handlePageChange as EventListener)
        }
    }, [])

    if (status === "loading") {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        )
    }

    if (!session) {
        return null
    }

    const renderPage = () => {
        switch (currentPage) {
            case "dashboard":
                return <Dashboard />
            case "students":
                return <StudentRecords />
            case "books":
                return <BookManagement />
            default:
                return <Dashboard />
        }
    }

    return (
        <div className="flex h-screen bg-background text-foreground">
            <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header currentPage={currentPage} />
                <main className="flex-1 overflow-auto bg-background">{renderPage()}</main>
            </div>
        </div>
    )
}


