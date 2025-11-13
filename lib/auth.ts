import { auth } from "@/app/api/auth/[...nextauth]/route"

export async function getSession() {
  return await auth()
}

