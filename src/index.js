import express from "express"
import cors from "cors"
import { SignJWT } from "jose"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./config/auth.js"
import { connectDatabase, db, mongoClient } from "./config/database.js"
import { requireRole, requireUser, signingKey } from "./middleware/requireUser.js"
import servicesRouter from "./routes/services.js"
import appointmentsRouter from "./routes/appointments.js"
import adminRouter from "./routes/admin.js"
import profileRouter from "./routes/profile.js"
import paymentsRouter, { stripeWebhook } from "./routes/payments.js"

const app = express()
const port = Number(process.env.PORT || 4000)

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
)

app.all("/api/auth/{*path}", toNodeHandler(auth))

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook,
)

app.use(express.json())
app.use("/api", servicesRouter)
app.use("/api", appointmentsRouter)
app.use("/api/admin", adminRouter)
app.use("/api/profile", profileRouter)
app.use("/api", paymentsRouter)

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
      const appointments = db.collection("appointments")
      const customerId = req.user.id

      const [
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        cancelledAppointments,
      ] = await Promise.all([
        appointments.countDocuments({ customerId }),
        appointments.countDocuments({ customerId, status: "pending" }),
        appointments.countDocuments({ customerId, status: "confirmed" }),
        appointments.countDocuments({ customerId, status: "cancelled" }),
      ])

      res.json({
        name: req.user.name,
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        cancelledAppointments,
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
      const appointments = db.collection("appointments")

      const [
        totalCustomers,
        totalActiveServices,
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        totalSuccessfulPayments,
      ] = await Promise.all([
        db.collection("users").countDocuments({ role: "customer" }),
        db.collection("services").countDocuments({ status: "active" }),
        appointments.countDocuments({}),
        appointments.countDocuments({ status: "pending" }),
        appointments.countDocuments({ status: "confirmed" }),
        db.collection("transactions").countDocuments({ status: "paid" }),
      ])

      res.json({
        totalCustomers,
        totalActiveServices,
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        totalSuccessfulPayments,
      })
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

    await db.collection("transactions").createIndex(
      { stripeSessionId: 1 },
      { unique: true },
    )

    console.log("MongoDB connection and payment indexes verified.")
  } catch (error) {
    console.error("Server startup failed", {
      name: error.name,
      code: error.code,
      message: error.message,
    })
    await mongoClient.close()
    process.exitCode = 1
    return
  }

  app.listen(port, () => {
    console.log(`SalonBook API is running on port ${port}`)
  })
}

startServer()