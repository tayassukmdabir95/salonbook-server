import { Router } from "express"
import { ObjectId } from "mongodb"
import { db } from "../config/database.js"
import { requireRole, requireUser } from "../middleware/requireUser.js"

const router = Router()

router.use(requireUser, requireRole("admin"))

router.get("/appointments", async (req, res) => {
  try {
    const appointments = await db
      .collection("appointments")
      .find({})
      .sort({ createdAt: -1 })
      .toArray()

    const serviceIds = [
      ...new Set(appointments.map((appointment) => appointment.serviceId)),
    ]
    const customerIds = [
      ...new Set(appointments.map((appointment) => appointment.customerId)),
    ]

    const [services, customers] = await Promise.all([
      serviceIds.length
        ? db.collection("services").find({
            _id: { $in: serviceIds.map((id) => new ObjectId(id)) },
          }).toArray()
        : [],
      customerIds.length
        ? db.collection("users").find({
            _id: { $in: customerIds.map((id) => new ObjectId(id)) },
          }).project({ name: 1, email: 1, image: 1 }).toArray()
        : [],
    ])

    const servicesById = new Map(
      services.map((service) => [String(service._id), service]),
    )
    const customersById = new Map(
      customers.map((customer) => [String(customer._id), customer]),
    )

    res.json({
      appointments: appointments.map((appointment) => ({
        ...appointment,
        service: servicesById.get(appointment.serviceId) || null,
        customer: customersById.get(appointment.customerId) || null,
      })),
    })
  } catch {
    res.status(500).json({ message: "Could not load appointments." })
  }
})

router.patch("/appointments/:id/confirm", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ message: "Invalid appointment ID." })
    return
  }

  try {
    const result = await db.collection("appointments").updateOne(
      { _id: new ObjectId(req.params.id), status: "pending" },
      { $set: { status: "confirmed" } },
    )

    if (result.modifiedCount === 1) {
      res.json({ message: "Appointment confirmed." })
      return
    }

    res.status(409).json({
      message: "Only a pending appointment can be confirmed.",
    })
  } catch {
    res.status(500).json({ message: "Could not confirm the appointment." })
  }
})

router.patch("/appointments/:id/cancel", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ message: "Invalid appointment ID." })
    return
  }

  try {
    const result = await db.collection("appointments").updateOne(
      {
        _id: new ObjectId(req.params.id),
        status: { $in: ["pending", "confirmed"] },
      },
      { $set: { status: "cancelled" } },
    )

    if (result.modifiedCount === 1) {
      res.json({ message: "Appointment cancelled." })
      return
    }

    res.status(409).json({ message: "This appointment is already cancelled." })
  } catch {
    res.status(500).json({ message: "Could not cancel the appointment." })
  }
})

router.get("/users", async (req, res) => {
  try {
    const users = await db
      .collection("users")
      .find({ role: "customer" })
      .project({
        name: 1,
        email: 1,
        image: 1,
        isBlocked: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1 })
      .toArray()

    res.json({ users })
  } catch {
    res.status(500).json({ message: "Could not load customers." })
  }
})

router.patch("/users/:id/block", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ message: "Invalid customer ID." })
    return
  }

  if (typeof req.body.isBlocked !== "boolean") {
    res.status(400).json({ message: "Choose a valid blocked status." })
    return
  }

  try {
    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(req.params.id), role: "customer" },
      { $set: { isBlocked: req.body.isBlocked } },
    )

    if (!result.matchedCount) {
      res.status(404).json({ message: "Customer not found." })
      return
    }

    res.json({
      message: req.body.isBlocked ? "Customer blocked." : "Customer unblocked.",
    })
  } catch {
    res.status(500).json({ message: "Could not update the customer." })
  }
})

router.get("/transactions", async (req, res) => {
  try {
    const transactions = await db
      .collection("transactions")
      .find({})
      .sort({ createdAt: -1 })
      .toArray()

    const appointmentIds = [
      ...new Set(transactions.map((transaction) => transaction.appointmentId)),
    ]
    const customerIds = [
      ...new Set(transactions.map((transaction) => transaction.customerId)),
    ]

    const [appointments, customers] = await Promise.all([
      appointmentIds.length
        ? db.collection("appointments").find({
            _id: { $in: appointmentIds.map((id) => new ObjectId(id)) },
          }).toArray()
        : [],
      customerIds.length
        ? db.collection("users").find({
            _id: { $in: customerIds.map((id) => new ObjectId(id)) },
          }).project({ name: 1, email: 1 }).toArray()
        : [],
    ])

    const serviceIds = [
      ...new Set(appointments.map((appointment) => appointment.serviceId)),
    ]
    const services = serviceIds.length
      ? await db.collection("services").find({
          _id: { $in: serviceIds.map((id) => new ObjectId(id)) },
        }).toArray()
      : []

    const appointmentsById = new Map(
      appointments.map((appointment) => [String(appointment._id), appointment]),
    )
    const customersById = new Map(
      customers.map((customer) => [String(customer._id), customer]),
    )
    const servicesById = new Map(
      services.map((service) => [String(service._id), service]),
    )

    res.json({
      transactions: transactions.map((transaction) => {
        const appointment = appointmentsById.get(transaction.appointmentId)

        return {
          ...transaction,
          appointmentDate: appointment?.appointmentDate || null,
          customer: customersById.get(transaction.customerId) || null,
          service: appointment
            ? servicesById.get(appointment.serviceId) || null
            : null,
        }
      }),
    })
  } catch {
    res.status(500).json({ message: "Could not load transactions." })
  }
})

export default router