import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"

const demoEmail = process.env.DEMO_ADMIN_EMAIL || "admin@library.edu"
const demoPassword = process.env.DEMO_ADMIN_PASSWORD || "demo123"

const providers = []

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  )
}

providers.push(
  Credentials({
    name: "Demo Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.trim().toLowerCase()
      const password = credentials?.password ?? ""

      if (email === demoEmail.toLowerCase() && password === demoPassword) {
        return {
          id: "demo-admin",
          name: "Demo Admin",
          email: demoEmail,
        }
      }

      return null
    },
  }),
)

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.access_token) {
        token.accessToken = account.access_token
      }
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.picture = (user as any).image
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) || "demo-admin"
        session.user.email = (token.email as string) || demoEmail
        session.user.name = token.name as string
        session.user.image = token.picture as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
})

export const { GET, POST } = handlers

