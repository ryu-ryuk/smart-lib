"use client"

import { useState, useMemo } from "react"
import { Search, Filter, MoreHorizontal } from "lucide-react"
import { books as allBooks } from "@/lib/data-loader"

export default function BookManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [sortBy, setSortBy] = useState("title")

  const books = allBooks;
  const categories = ["all", ...new Set(books.map((b) => b.category))]

  const filteredBooks = useMemo(() => {
    const result = books.filter((book) => {
      const matchesSearch =
        book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.isbn.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.borrowedBy?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus = filterStatus === "all" || book.status === filterStatus
      const matchesCategory = filterCategory === "all" || book.category === filterCategory

      return matchesSearch && matchesStatus && matchesCategory
    })

    result.sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.title.localeCompare(b.title)
        case "author":
          return a.author.localeCompare(b.author)
        case "category":
          return a.category.localeCompare(b.category)
        default:
          return 0
      }
    })

    return result
  }, [searchTerm, filterStatus, filterCategory, sortBy])

  const stats = {
    total: books.length,
    available: books.filter((b) => b.status === "available").length,
    borrowed: books.filter((b) => b.status === "borrowed").length,
  }

  return (
    <div className="p-8 space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Books</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
            <div className="text-3xl text-muted opacity-20">📚</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Available</p>
              <p className="text-2xl font-bold text-green-400">{stats.available}</p>
            </div>
            <div className="text-3xl text-green-500 opacity-20">✓</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Borrowed</p>
              <p className="text-2xl font-bold text-orange-400">{stats.borrowed}</p>
            </div>
            <div className="text-3xl text-orange-500 opacity-20">→</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by title, ISBN, author, or student..."
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
              <option value="available">Available</option>
              <option value="borrowed">Borrowed</option>
            </select>
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Categories</option>
            {categories.slice(1).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="title">Sort by Title</option>
            <option value="author">Sort by Author</option>
            <option value="category">Sort by Category</option>
          </select>
        </div>
      </div>

      {/* Books Table */}
      <div className="stat-card">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ISBN</th>
                <th>Title</th>
                <th>Author</th>
                <th>Category</th>
                <th>Status</th>
                <th>Borrowed By</th>
                <th>Due Date</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBooks.map((book, idx) => (
                <tr key={idx}>
                  <td className="font-mono text-sm">{book.isbn}</td>
                  <td className="font-medium">{book.title}</td>
                  <td>{book.author}</td>
                  <td className="text-muted-foreground">{book.category}</td>
                  <td>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${book.status === "available"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-orange-500/20 text-orange-400"
                        }`}
                    >
                      {book.status}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{book.borrowedBy || "-"}</td>
                  <td className="text-muted-foreground">{book.dueDate || "-"}</td>
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
          Showing {filteredBooks.length} of {books.length} books
        </div>
      </div>
    </div>
  )
}
