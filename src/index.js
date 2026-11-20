import express from "express"
import { connectDatabase, mongoClient } from "./config/database.js"

const app = express()
const port = Number(process.env.PORT || 4000)

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