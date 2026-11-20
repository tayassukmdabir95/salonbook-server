import { betterAuth } from "better-auth"
import { mongodbAdapter } from "better-auth/adapters/mongodb"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { db, mongoClient } from "./database.js"

const {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  CLIENT_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} = process.env

if (!BETTER_AUTH_SECRET || !BETTER_AUTH_URL || !CLIENT_URL) {
  throw new Error("BETTER_AUTH_SECRET, BETTER_AUTH_URL and CLIENT_URL are required.")
}

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.")
}

export const auth = betterAuth({
  appName: "SalonBook",
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  trustedOrigins: [CLIENT_URL],
  database: mongodbAdapter(db, { client: mongoClient }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  socialProviders: {
    google: {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
    },
  },
  user: {
    modelName: "users",
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "customer",
        input: false,
      },
      isBlocked: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: false,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return

      const password = ctx.body?.password

      if (
        typeof password !== "string" ||
        password.length < 6 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password)
      ) {
        throw new APIError("BAD_REQUEST", {
          message: "Use at least 6 characters with one uppercase and one lowercase letter.",
        })
      }
    }),
  },
})