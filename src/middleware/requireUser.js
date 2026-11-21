import { fromNodeHeaders } from "better-auth/node"
import { jwtVerify } from "jose"
import { auth } from "../config/auth.js"
import { db } from "../config/database.js"

const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters.")
}

const signingKey = new TextEncoder().encode(jwtSecret)

export { signingKey }

export async function requireUser(req, res, next) {
  try {
    const authorization = req.headers.authorization
    let email

    if (authorization) {
      if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Invalid authorization header." })
      }

      const token = authorization.slice(7)
      const { payload } = await jwtVerify(token, signingKey, {
        issuer: "salonbook-server",
        audience: "salonbook-client",
      })

      email = payload.email
    } else {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      })

      email = session?.user?.email
    }

    if (!email) {
      return res.status(401).json({ message: "Sign in to continue." })
    }

    const user = await db.collection("users").findOne({ email })

    if (!user) {
      return res.status(401).json({ message: "Account not found." })
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account is blocked." })
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      image: user.image || null,
      role: user.role || "customer",
    }

    next()
  } catch {
    res.status(401).json({ message: "Your session or token is invalid." })
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: "Access denied for this account." })
    }

    next()
  }
}