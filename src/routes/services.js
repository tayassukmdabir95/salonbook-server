import { Router } from "express"
import multer from "multer"
import { ObjectId } from "mongodb"
import { db } from "../config/database.js"
import { requireRole, requireUser } from "../middleware/requireUser.js"

const router = Router()
const uploads = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, done) {
    const allowed = ["image/jpeg", "image/png", "image/webp"]

    if (!allowed.includes(file.mimetype)) {
      done(new Error("Choose a JPG, PNG, or WebP image."))
      return
    }

    done(null, true)
  },
})

function readService(body) {
  const serviceName = String(body.serviceName || "").trim()
  const category = String(body.category || "").trim()
  const description = String(body.description || "").trim()
  const image = String(body.image || "").trim()
  const price = Number(body.price)
  const duration = Number(body.duration)
  const status = body.status || "active"

  if (!serviceName || !category || !description || !image) {
    return { error: "Complete all service fields and upload an image." }
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Price must be a positive number." }
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return { error: "Duration must be a positive number." }
  }

  if (!["active", "inactive"].includes(status)) {
    return { error: "Choose a valid service status." }
  }

  return {
    serviceName,
    category,
    description,
    image,
    price,
    duration,
    status,
  }
}

function validId(id) {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id.toLowerCase()
}

router.get("/services", async (req, res) => {
  try {
    const services = await db
      .collection("services")
      .find({ status: "active" })
      .sort({ createdAt: -1 })
      .toArray()

    res.json({ services })
  } catch {
    res.status(500).json({ message: "Could not load services." })
  }
})
router.get("/services/:id", requireUser, async (req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).json({ message: "Invalid service ID." })
    return
  }

  try {
    const service = await db.collection("services").findOne({
      _id: new ObjectId(req.params.id),
      status: "active",
    })

    if (!service) {
      res.status(404).json({ message: "This service is unavailable." })
      return
    }

    res.json({ service })
  } catch {
    res.status(500).json({ message: "Could not load this service." })
  }
})

router.get(
  "/admin/services",
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    try {
      const services = await db
        .collection("services")
        .find({})
        .sort({ createdAt: -1 })
        .toArray()

      res.json({ services })
    } catch {
      res.status(500).json({ message: "Could not load services." })
    }
  },
)

router.post(
  "/admin/uploads",
  requireUser,
  requireRole("admin"),
  (req, res, next) => {
    uploads.single("image")(req, res, (error) => {
      if (error) {
        res.status(400).json({ message: error.message })
        return
      }

      next()
    })
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Choose an image to upload." })
      return
    }

    if (!process.env.IMGBB_API_KEY) {
      res.status(500).json({ message: "Image hosting is not configured." })
      return
    }

    try {
      const form = new FormData()
      form.append("image", req.file.buffer.toString("base64"))

      const response = await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(process.env.IMGBB_API_KEY)}`,
        { method: "POST", body: form },
      )

      const result = await response.json()

      if (!response.ok || !result.success || !result.data?.url) {
        throw new Error()
      }

      res.json({ image: result.data.url })
    } catch {
      res.status(502).json({ message: "Image upload failed. Try again." })
    }
  },
)

router.post(
  "/admin/services",
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    const service = readService(req.body)

    if (service.error) {
      res.status(400).json({ message: service.error })
      return
    }

    try {
      const result = await db.collection("services").insertOne({
        ...service,
        createdAt: new Date(),
      })

      res.status(201).json({ id: String(result.insertedId) })
    } catch {
      res.status(500).json({ message: "Could not create the service." })
    }
  },
)

router.put(
  "/admin/services/:id",
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ message: "Invalid service ID." })
      return
    }

    const service = readService(req.body)

    if (service.error) {
      res.status(400).json({ message: service.error })
      return
    }

    try {
      const result = await db.collection("services").updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: service },
      )

      if (!result.matchedCount) {
        res.status(404).json({ message: "Service not found." })
        return
      }

      res.json({ message: "Service updated." })
    } catch {
      res.status(500).json({ message: "Could not update the service." })
    }
  },
)

router.delete(
  "/admin/services/:id",
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    if (!validId(req.params.id)) {
      res.status(400).json({ message: "Invalid service ID." })
      return
    }

    const serviceId = new ObjectId(req.params.id)

    try {
      const bookings = await db.collection("appointments").countDocuments({
        serviceId: String(serviceId),
      })

      if (bookings > 0) {
        res.status(409).json({
          message: "This service has appointment history. Deactivate it instead.",
        })
        return
      }

      const result = await db.collection("services").deleteOne({
        _id: serviceId,
      })

      if (!result.deletedCount) {
        res.status(404).json({ message: "Service not found." })
        return
      }

      res.json({ message: "Service deleted." })
    } catch {
      res.status(500).json({ message: "Could not delete the service." })
    }
  },
)

export default router