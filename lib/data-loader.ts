/**
 * Data loader - loads generated data or falls back to mock data
 */

import { mockBooks, mockStudents, mockAttendanceData } from './mock-data';

// Try to load generated data, fallback to mock
let generatedBooks: any[] = [];
let generatedStudents: any[] = [];
let generatedAttendance: any[] = [];

try {
  const booksData = require('./generated-data/books.json');
  generatedBooks = Array.isArray(booksData) ? booksData : booksData.default || [];
} catch {}

try {
  const studentsData = require('./generated-data/students.json');
  generatedStudents = Array.isArray(studentsData) ? studentsData : studentsData.default || [];
} catch {}

try {
  const attendanceData = require('./generated-data/attendance.json');
  generatedAttendance = Array.isArray(attendanceData) ? attendanceData : attendanceData.default || [];
} catch {}

export const books = generatedBooks.length > 0 ? generatedBooks : mockBooks;
export const students = generatedStudents.length > 0 ? generatedStudents : mockStudents;
export const attendance = generatedAttendance.length > 0 ? generatedAttendance : mockAttendanceData;

