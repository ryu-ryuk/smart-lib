"use client"

import { useEffect, useState } from "react"
import { BookOpen, BarChart3, Users, ArrowRight, Sparkles } from "lucide-react"
import Link from "next/link"

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 16)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden relative">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Glow bars top/bottom - subtle Cartesia-like */}
        <div className="glow-bar top-0 bg-gradient-to-r from-accent/30 via-emerald-300/25 to-accent/30" />
        <div className="glow-bar bottom-0 bg-gradient-to-r from-accent/30 via-emerald-300/25 to-accent/30" />

        {/* Orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" />
        <div
          className="absolute top-1/3 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float-slow"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute bottom-0 left-1/2 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "4s" }}
        />
        {/* Grain */}
        <div className="grain-overlay" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div
          className={`mx-auto px-6 flex items-center justify-between transition-all duration-300 ${scrolled
              ? "max-w-3xl mt-3 py-2 nav-pill"
              : "max-w-7xl py-4 glass-effect border-b border-white/10"
            }`}
        >
          <div className="flex items-center gap-3 animate-fade-in">
            <div className="w-10 h-10 bg-gradient-to-br from-accent to-accent/60 rounded-lg flex items-center justify-center shadow-lg">
              <BookOpen className="w-6 h-6 text-accent-foreground" />
            </div>
            <h1 className="text-xl font-bold">Smart Library</h1>
          </div>
          <Link
            href="/login"
            className="px-6 py-2 bg-gradient-to-r from-accent to-accent/80 text-accent-foreground rounded-full font-medium hover:shadow-lg hover:shadow-accent/20 transition-all duration-300 animate-fade-in"
            style={{ animationDelay: "0.2s" }}
          >
            Enter System
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-2 glass-effect rounded-full animate-slide-up">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent animate-glow-pulse" />
              <span className="text-accent font-medium text-sm">IoT-Powered Library Management</span>
            </div>
          </div>

          <h2
            className="text-5xl md:text-7xl font-bold mb-6 leading-tight text-balance animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            Intelligent Library Attendance and Book Management
          </h2>

          <p
            className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto text-balance animate-slide-up"
            style={{ animationDelay: "0.2s" }}
          >
            Streamline your library operations with real-time attendance tracking, automated book management, and
            comprehensive student records. Built for modern educational institutions.
          </p>

          <div
            className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-slide-up"
            style={{ animationDelay: "0.3s" }}
          >
            <Link
              href="/login"
              className="px-8 py-3 bg-gradient-to-r from-accent to-accent/80 text-accent-foreground rounded-full font-medium hover:shadow-lg hover:shadow-accent/20 transition-all duration-300 flex items-center justify-center gap-2 group"
            >
              Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button className="px-8 py-3 glass-effect rounded-full font-medium hover:bg-white/10 transition-all duration-300">
              Learn More
            </button>
          </div>

          {/* Feature Preview */}
          <div className="grid md:grid-cols-3 gap-6 mt-20">
            {[
              {
                icon: BarChart3,
                title: "Real-Time Dashboard",
                description: "Monitor attendance, book status, and library metrics at a glance with live analytics.",
                delay: "0.4s",
              },
              {
                icon: Users,
                title: "Student Management",
                description: "Track student records, attendance history, and book borrowing patterns efficiently.",
                delay: "0.5s",
              },
              {
                icon: BookOpen,
                title: "Book Inventory",
                description: "Manage book collections, track borrowing status, and monitor due dates automatically.",
                delay: "0.6s",
              },
            ].map((feature, idx) => {
              const Icon = feature.icon
              return (
                <div
                  key={idx}
                  className="glass-effect rounded-2xl p-8 hover:bg-white/8 transition-all duration-300 group cursor-pointer animate-slide-up card-float"
                  style={{ animationDelay: feature.delay }}
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-accent/30 to-accent/10 rounded-lg flex items-center justify-center mb-4 mx-auto group-hover:from-accent/50 group-hover:to-accent/20 transition-all duration-300">
                    <Icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-4xl font-bold mb-12 text-center animate-slide-up">Powerful Features</h3>

          <div className="space-y-8">
            {[
              {
                num: "1",
                title: "Automated Attendance Tracking",
                description: "IoT sensors automatically log student check-ins and check-outs with precise timestamps.",
              },
              {
                num: "2",
                title: "Comprehensive Student Records",
                description:
                  "Maintain detailed student profiles with admission numbers, departments, and borrowing history.",
              },
              {
                num: "3",
                title: "Smart Book Management",
                description:
                  "Track book availability, manage loans, and receive alerts for overdue items automatically.",
              },
              {
                num: "4",
                title: "Advanced Analytics",
                description:
                  "Gain insights with detailed reports on attendance patterns, book popularity, and library usage.",
              },
            ].map((feature, idx) => (
              <div key={idx} className="flex gap-6 animate-slide-up" style={{ animationDelay: `${0.7 + idx * 0.1}s` }}>
                <div className="w-12 h-12 bg-gradient-to-br from-accent/30 to-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold">{feature.num}</span>
                </div>
                <div>
                  <h4 className="text-lg font-semibold mb-2">{feature.title}</h4>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 px-6 border-t border-white/10">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="text-4xl font-bold mb-4 animate-slide-up">Ready to Transform Your Library?</h3>
          <p className="text-muted-foreground mb-8 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Start managing your library efficiently with Smart Library System today.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-gradient-to-r from-accent to-accent/80 text-accent-foreground rounded-full font-medium hover:shadow-lg hover:shadow-accent/20 transition-all duration-300 animate-slide-up"
            style={{ animationDelay: "0.2s" }}
          >
            Access Dashboard
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/10 py-8 px-6">
        <div className="max-w-7xl mx-auto text-center text-muted-foreground text-sm">
          <p>Smart Library System v1.0.0 © 2025. All rights reserved.</p>
          <p className="mt-2">
            Built by <span className="text-foreground font-medium">Alok Ranjan</span> ·
            <a href="https://github.com/ryu-ryuk" className="underline-offset-4 hover:underline text-foreground/80 ml-1" target="_blank" rel="noreferrer">@ryu-ryuk</a>
          </p>
        </div>
      </footer>
    </div>
  )
}
