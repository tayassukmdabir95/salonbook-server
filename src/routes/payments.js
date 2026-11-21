import { Router } from "express"
import { ObjectId } from "mongodb"
import Stripe from "stripe"
import { db, mongoClient } from "../config/database.js"
import { requireRole, requireUser } from "../middleware/requireUser.js"

const router = Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function stripeWebhook(req, res) {
  const signature = req.headers["stripe-signature"]

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(400).json({ message: "Missing webhook signature." })
    return
  }

  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    )
  } catch {
    res.status(400).json({ message: "Invalid webhook signature." })
    return
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    res.json({ received: true })
    return
  }

  const checkoutSession = event.data.object

  if (checkoutSession.payment_status !== "paid") {
    res.json({ received: true })
    return
  }

  const appointmentId = checkoutSession.metadata?.appointmentId
  const customerId = checkoutSession.metadata?.customerId

  if (!ObjectId.isValid(appointmentId) || !ObjectId.isValid(customerId)) {
    res.status(400).json({ message: "Invalid payment reference." })
    return
  }

  const databaseSession = mongoClient.startSession()

  try {
    await databaseSession.withTransaction(async () => {
      const existingTransaction = await db.collection("transactions").findOne(
        { stripeSessionId: checkoutSession.id },
        { session: databaseSession },
      )

      if (existingTransaction) return

      const appointment = await db.collection("appointments").findOne(
        {
          _id: new ObjectId(appointmentId),
          customerId,
        },
        { session: databaseSession },
      )

      if (!appointment) {
        throw new Error("Appointment not found for Stripe payment.")
      }

      const expectedAmount = Math.round(Number(appointment.servicePrice) * 100)
      const expectedCurrency = (process.env.STRIPE_CURRENCY || "usd").toLowerCase()

      if (
        checkoutSession.amount_total !== expectedAmount ||
        checkoutSession.currency !== expectedCurrency
      ) {
        throw new Error("Stripe payment amount or currency does not match.")
      }

      await db.collection("transactions").insertOne(
        {
          appointmentId,
          customerId,
          amount: checkoutSession.amount_total / 100,
          currency: checkoutSession.currency,
          stripeSessionId: checkoutSession.id,
          status: "paid",
          createdAt: new Date(),
        },
        { session: databaseSession },
      )

      await db.collection("appointments").updateOne(
        { _id: new ObjectId(appointmentId) },
        { $set: { paymentStatus: "paid" } },
        { session: databaseSession },
      )
    })

    res.json({ received: true })
  } catch (error) {
    if (error.code === 11000) {
      res.json({ received: true })
      return
    }

    console.error("Stripe payment processing failed", {
      message: error.message,
      code: error.code,
    })
    res.status(500).json({ message: "Could not record payment." })
  } finally {
    await databaseSession.endSession()
  }
}

router.get(
  "/customer/payments/session/:id",
  requireUser,
  requireRole("customer"),
  async (req, res) => {
    try {
      const transaction = await db.collection("transactions").findOne({
        stripeSessionId: req.params.id,
        customerId: req.user.id,
        status: "paid",
      })

      res.json({
        status: transaction ? "paid" : "processing",
        appointmentId: transaction?.appointmentId || null,
      })
    } catch {
      res.status(500).json({ message: "Could not load payment status." })
    }
  },
)

export default router