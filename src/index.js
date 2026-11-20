import express from "express"
import cors from "cors"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./config/auth.js"
import { connectDatabase, mongoClient } from "./config/database.js"

const app = express()
const port = Number(process.env.PORT || 4000)

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
)

app.all("/api/auth/{*path}", toNodeHandler(auth))

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "salonbook-server",
  })
})

async function startServer() {
  try {
    await connectDatabase()
    console.log("MongoDB connection verified.")
  } catch (error) {
    console.error(`MongoDB connection failed (${error.name}). Check your database credentials and network access.`)
    await mongoClient.close()
    process.exitCode = 1
    return
  }

  app.listen(port, () => {
    console.log(`SalonBook API is running on port ${port}`)
  })
}

startServer()