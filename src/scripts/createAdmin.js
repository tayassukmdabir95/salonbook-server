import { auth } from "../config/auth.js"
import { connectDatabase, db, mongoClient } from "../config/database.js"

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required.")
  }

  if (
    password.length < 6 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password)
  ) {
    throw new Error(
      "ADMIN_PASSWORD needs at least 6 characters, one uppercase letter, and one lowercase letter.",
    )
  }

  await connectDatabase()

  const existingUser = await db.collection("users").findOne({ email })

  if (existingUser) {
    throw new Error("This email already belongs to a SalonBook user.")
  }

  await auth.api.signUpEmail({
    body: {
      name: "SalonBook Admin",
      email,
      password,
    },
  })

  const result = await db.collection("users").updateOne(
    { email, role: "customer" },
    { $set: { role: "admin", isBlocked: false } },
  )

  if (result.modifiedCount !== 1) {
    throw new Error("The account was created, but the admin role was not assigned.")
  }

  console.log(`Admin account created for ${email}.`)
}

try {
  await createAdmin()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await mongoClient.close()
}