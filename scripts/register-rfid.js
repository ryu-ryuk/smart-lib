#!/usr/bin/env node

/**
 * Quick helper to associate an RFID UID with an existing student.
 *
 * Usage:
 *   node scripts/register-rfid.js --admission 24GCE24001 --rfid E44E6A05C5
 *
 * Alternatively, run without flags and it will prompt interactively.
 */

const readline = require("readline")

const args = process.argv.slice(2)
const argMap = {}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg.startsWith("--")) {
    const key = arg.replace(/^--/, "")
    const value = args[i + 1]
    if (!value || value.startsWith("--")) {
      console.error(`Missing value for flag ${arg}`)
      process.exit(1)
    }
    argMap[key] = value
    i += 1
  }
}

const apiBase = process.env.ADMIN_API_URL || "http://localhost:8001"

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    }),
  )
}

async function main() {
  let admissionNo = argMap.admission || argMap.student
  let rfidUid = argMap.rfid || argMap.uid

  if (!admissionNo) {
    admissionNo = await prompt("Student admission number: ")
  }

  if (!rfidUid) {
    rfidUid = await prompt("RFID UID (as seen in logs): ")
  }

  if (!admissionNo || !rfidUid) {
    console.error("Both admission number and RFID UID are required.")
    process.exit(1)
  }

  const payload = {
    admission_no: admissionNo.trim(),
    rfid_uid: rfidUid.trim().toUpperCase(),
  }

  console.log(`\nRegistering RFID ${payload.rfid_uid} -> ${payload.admission_no}...`)

  try {
    const res = await fetch(`${apiBase}/students/register-rfid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`${res.status} ${res.statusText}: ${errText}`)
    }

    const data = await res.json()
    console.log("Registration successful:", data)
    console.log("The gateway will now accept scans from this RFID tag.")
  } catch (err) {
    console.error("Failed to register RFID UID:")
    console.error(err.message || err)
    process.exit(1)
  }
}

main()

