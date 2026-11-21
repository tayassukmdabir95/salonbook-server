import { Router } from "express"
import { db } from "../config/database.js"
import { requireUser } from "../middleware/requireUser.js"

const router = Router()

router.use(requireUser)

router.get("/", async (req, res) => {
  try {
    const user = await db.collection("users").findOne(
      { email: req.user.email },
      {
        projection: {
          name: 1,
          email: 1,
          image: 1,
          phone: 1,
          role: 1,
        },
      },
    )

    if (!user) {
      res.status(404).json({ message: "Profile not found." })
      return
    }

    res.json({ user })
  } catch {
    res.status(500).json({ message: "Could not load your profile." })
  }
})

router.patch("/", async (req, res) => {
  const allowedFields = new Set(["name", "image", "phone"])
  const submittedFields = Object.keys(req.body || {})

  if (submittedFields.some((field) => !allowedFields.has(field))) {
    res.status(400).json({ message: "This profile field cannot be changed." })
    return
  }

  const name = String(req.body.name || "").trim()
  const image = String(req.body.image || "").trim()
  const phone = String(req.body.phone || "").trim()

  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ message: "Name must contain 2 to 80 characters." })
    return
  }

  if (image) {
    try {
      const url = new URL(image)

      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error()
      }
    } catch {
      res.status(400).json({ message: "Enter a valid image URL." })
      return
    }
  }

  if (phone.length > 30 || (phone && !/^[+()\d\s-]+$/.test(phone))) {
    res.status(400).json({ message: "Enter a valid phone number." })
    return
  }

  try {
    await db.collection("users").updateOne(
      { email: req.user.email },
      { $set: { name, image, phone } },
    )

    res.json({
      message: "Profile updated.",
      user: {
        name,
        email: req.user.email,
        image,
        phone,
        role: req.user.role,
      },
    })
  } catch {
    res.status(500).json({ message: "Could not update your profile." })
  }
})

export default router