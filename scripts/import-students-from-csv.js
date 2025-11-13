#!/usr/bin/env node
/**
 * Import students from CSV file
 * Usage: node scripts/import-students-from-csv.js <csv-file>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CSV_FILE = process.argv[2] || 'Untitled spreadsheet - Sheet1 (5).csv';
const CSV_PATH = path.join(__dirname, '..', CSV_FILE);

if (!fs.existsSync(CSV_PATH)) {
  console.error(`Error: CSV file not found: ${CSV_PATH}`);
  process.exit(1);
}

// Parse CSV
const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
const lines = csvContent.trim().split('\n');

// Skip header rows (first 2 lines)
const dataLines = lines.slice(2);

const students = [];

dataLines.forEach((line, index) => {
  if (!line.trim()) return;
  
  // Parse CSV line (handling commas in quoted fields)
  const fields = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField.trim());
  
  // Extract fields (based on CSV structure)
  // Columns: S. No, Sec S. NO., Sem, Branch/Section, Group, AKTU Roll No, Name, Admission No
  if (fields.length >= 8) {
    const sem = fields[2] || '';
    const branchFull = fields[3] || '';
    const name = fields[6] || '';
    const admissionNo = fields[7] || '';
    
    // Extract branch from "BTECH(EC-A)" -> "ECE"
    let branch = null;
    if (branchFull.includes('EC')) {
      branch = 'Electronics and Communication Engineering';
    } else if (branchFull.includes('CS')) {
      branch = 'Computer Science';
    } else if (branchFull.includes('ME')) {
      branch = 'Mechanical Engineering';
    } else if (branchFull.includes('CE')) {
      branch = 'Civil Engineering';
    } else {
      // Extract from pattern like "BTECH(EC-A)"
      const match = branchFull.match(/\(([^)]+)\)/);
      if (match) {
        branch = match[1];
      }
    }
    
    // Extract year from semester (III Sem = 2nd year, V Sem = 3rd year, etc.)
    let year = null;
    if (sem.includes('III') || sem.includes('3')) {
      year = 2;
    } else if (sem.includes('V') || sem.includes('5')) {
      year = 3;
    } else if (sem.includes('VII') || sem.includes('7')) {
      year = 4;
    } else if (sem.includes('I') || sem.includes('1')) {
      year = 1;
    }
    
    if (admissionNo && name) {
      students.push({
        admission_no: admissionNo.trim(),
        name: name.trim(),
        branch: branch,
        year: year,
      });
    }
  }
});

console.log(`Parsed ${students.length} students from CSV`);
console.log('Sample:', students[0]);

// Generate SQL
let sql = '-- Import students from CSV\n\n';
sql += '-- Clear existing data\n';
sql += 'TRUNCATE TABLE attendance_state CASCADE;\n';
sql += 'TRUNCATE TABLE attendance CASCADE;\n';
sql += 'TRUNCATE TABLE events_raw CASCADE;\n';
sql += 'TRUNCATE TABLE students CASCADE;\n\n';

sql += '-- Insert students\n';
sql += 'INSERT INTO students (admission_no, name, branch, year, created_at) VALUES\n';
sql += students.map((s, i) => {
  const name = s.name.replace(/'/g, "''");
  const branch = s.branch ? `'${s.branch.replace(/'/g, "''")}'` : 'NULL';
  const year = s.year || 'NULL';
  const comma = i < students.length - 1 ? ',' : ';';
  const timestamp = new Date().toISOString();
  return `  ('${s.admission_no}', '${name}', ${branch}, ${year}, '${timestamp}')${comma}`;
}).join('\n') + '\n';

// Write SQL file
const sqlFile = path.join(__dirname, 'temp-import-students.sql');
fs.writeFileSync(sqlFile, sql);
console.log(`\nSQL file generated: ${sqlFile}`);

// Check if postgres is running
try {
  execSync('docker-compose -f docker-compose.dev.yml ps postgres | grep -q "Up"', { stdio: 'ignore' });
  
  console.log('\nInserting students into database...');
  execSync(`docker-compose -f docker-compose.dev.yml exec -T postgres psql -U attendance_user -d attendance < ${sqlFile}`, {
    stdio: 'inherit'
  });
  
  // Verify
  console.log('\nVerifying import...');
  const result = execSync(
    'docker-compose -f docker-compose.dev.yml exec -T postgres psql -U attendance_user -d attendance -c "SELECT COUNT(*) as count FROM students;"',
    { encoding: 'utf8' }
  );
  console.log(result);
  
  // Clean up
  fs.unlinkSync(sqlFile);
  console.log('\nStudents imported successfully!');
} catch (error) {
  console.error('\nError: PostgreSQL is not running or connection failed.');
  console.error('Start PostgreSQL first: npm run backend:start');
  console.error(`\nSQL file saved at: ${sqlFile}`);
  console.error('You can import it manually later.');
  process.exit(1);
}

