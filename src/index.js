import express from "express"
import cors from "cors"
import { SignJWT } from "jose"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./config/auth.js"
import { connectDatabase, db, mongoClient } from "./config/database.js"
import { requireRole, requireUser, signingKey } from "./middleware/requireUser.js"
import servicesRouter from "./routes/services.js"
import appointmentsRouter from "./routes/appointments.js"

const app = express()
const port = Number(process.env.PORT || 4000)

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
)

app.all("/api/auth/{*path}", toNodeHandler(auth))
app.use(express.json())
app.use("/api", servicesRouter)
app.use("/api", appointmentsRouter)

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "salonbook-server",
  })
})

app.get("/api/me", requireUser, (req, res) => {
  res.json({ user: req.user })
})

app.post("/api/token", requireUser, async (req, res) => {
  try {
    const token = await new SignJWT({ email: req.user.email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("salonbook-server")
      .setAudience("salonbook-client")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(signingKey)

    res.json({ token })
  } catch {
    res.status(500).json({ message: "Could not create an access token." })
  }
})

app.get(
  "/api/customer/overview",
  requireUser,
  requireRole("customer"),
  async (req, res) => {
    try {
      const totalAppointments = await db.collection("appointments").countDocuments({
        customerId: req.user.id,
      })

      res.json({
        name: req.user.name,
        totalAppointments,
      })
    } catch {
      res.status(500).json({ message: "Could not load your overview." })
    }
  },
)

app.get(
  "/api/admin/overview",
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    try {
      const totalCustomers = await db.collection("users").countDocuments({
        role: "customer",
      })

      res.json({ totalCustomers })
    } catch {
      res.status(500).json({ message: "Could not load the admin overview." })
    }
  },
)

async function startServer() {
  try {
    await connectDatabase()
await db.collection("appointments").createIndex(
  { appointmentDate: 1, timeSlot: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "confirmed"] },
    },
  },
)
console.log("MongoDB connection and booking index verified.")
  } catch (error) {
    console.error(
      `MongoDB connection failed (${error.name}). Check your database credentials and network access.`,
    )
    await mongoClient.close()
    process.exitCode = 1
    return
  }

  app.listen(port, () => {
    console.log(`SalonBook API is running on port ${port}`)
  })
}

startServer()