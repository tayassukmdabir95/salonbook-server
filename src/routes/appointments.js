import { Router } from "express"
import { ObjectId } from "mongodb"
import { db } from "../config/database.js"
import { requireRole, requireUser } from "../middleware/requireUser.js"

const router = Router()

const timeSlots = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
]

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= new Date().toISOString().slice(0, 10)
  )
}

router.get(
  "/appointments/slots",
  requireUser,
  requireRole("customer"),
  async (req, res) => {
    const appointmentDate = req.query.date

    if (!validDate(appointmentDate)) {
      res.status(400).json({ message: "Choose a valid present or future date." })
      return
    }

    try {
      const appointments = await db
        .collection("appointments")
        .find({
          appointmentDate,
          status: { $in: ["pending", "confirmed"] },
        })
        .project({ timeSlot: 1 })
        .toArray()

      const bookedSlots = new Set(
        appointments.map((appointment) => appointment.timeSlot),
      )

      res.json({
        slots: timeSlots.filter((slot) => !bookedSlots.has(slot)),
      })
    } catch {
      res.status(500).json({ message: "Could not load available times." })
    }
  },
)

router.post(
  "/appointments",
  requireUser,
  requireRole("customer"),
  async (req, res) => {
    const { serviceId, appointmentDate, timeSlot } = req.body
    const message = String(req.body.message || "").trim()

    if (!ObjectId.isValid(serviceId)) {
      res.status(400).json({ message: "Choose a valid service." })
      return
    }

    if (!validDate(appointmentDate)) {
      res.status(400).json({ message: "Choose a valid present or future date." })
      return
    }

    if (!timeSlots.includes(timeSlot)) {
      res.status(400).json({ message: "Choose an available time slot." })
      return
    }

    if (message.length > 500) {
      res.status(400).json({ message: "Keep your message under 500 characters." })
      return
    }

    try {
      const service = await db.collection("services").findOne({
        _id: new ObjectId(serviceId),
        status: "active",
      })

      if (!service) {
        res.status(404).json({ message: "This service is unavailable." })
        return
      }

      const appointment = {
        serviceId: String(service._id),
        customerId: req.user.id,
        appointmentDate,
        timeSlot,
        message,
        servicePrice: service.price,
        paymentStatus: "unpaid",
        status: "pending",
        createdAt: new Date(),
      }

      const result = await db.collection("appointments").insertOne(appointment)

      res.status(201).json({
        id: String(result.insertedId),
        message: "Appointment request sent.",
      })
    } catch (error) {
      if (error.code === 11000) {
        res.status(409).json({
          message: "That time was just booked. Choose another slot.",
        })
        return
      }

      res.status(500).json({ message: "Could not create the appointment." })
    }
  },
)

export default router


router.get(
  "/customer/appointments",
  requireUser,
  requireRole("customer"),
  async (req, res) => {
    try {
      const appointments = await db
        .collection("appointments")
        .find({ customerId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray()

      const serviceIds = [
        ...new Set(appointments.map((appointment) => appointment.serviceId)),
      ]

      const services = serviceIds.length
        ? await db
            .collection("services")
            .find({
              _id: { $in: serviceIds.map((id) => new ObjectId(id)) },
            })
            .toArray()
        : []

      const servicesById = new Map(
        services.map((service) => [String(service._id), service]),
      )

      res.json({
        appointments: appointments.map((appointment) => ({
          ...appointment,
          service: servicesById.get(appointment.serviceId) || null,
        })),
      })
    } catch {
      res.status(500).json({ message: "Could not load your appointments." })
    }
  },
)

router.get(
  "/customer/appointments/:id",
  requireUser,
  requireRole("customer"),
  async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      res.status(400).json({ message: "Invalid appointment ID." })
      return
    }

    try {
      const appointment = await db.collection("appointments").findOne({
        _id: new ObjectId(req.params.id),
        customerId: req.user.id,
      })

      if (!appointment) {
        res.status(404).json({ message: "Appointment not found." })
        return
      }

      const service = await db.collection("services").findOne({
        _id: new ObjectId(appointment.serviceId),
      })

      res.json({ appointment: { ...appointment, service } })
    } catch {
      res.status(500).json({ message: "Could not load this appointment." })
    }
  },
)

router.patch(
  "/customer/appointments/:id/cancel",
  requireUser,
  requireRole("customer"),
  async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      res.status(400).json({ message: "Invalid appointment ID." })
      return
    }

    const appointmentId = new ObjectId(req.params.id)

    try {
      const result = await db.collection("appointments").updateOne(
        {
          _id: appointmentId,
          customerId: req.user.id,
          status: "pending",
        },
        { $set: { status: "cancelled" } },
      )

      if (result.modifiedCount === 1) {
        res.json({ message: "Appointment cancelled." })
        return
      }

      const appointment = await db.collection("appointments").findOne({
        _id: appointmentId,
        customerId: req.user.id,
      })

      if (!appointment) {
        res.status(404).json({ message: "Appointment not found." })
        return
      }

      res.status(409).json({
        message: "Only a pending appointment can be cancelled.",
      })
    } catch {
      res.status(500).json({ message: "Could not cancel the appointment." })
    }
  },
)