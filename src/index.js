import express from "express"

const app = express()
const port = Number(process.env.PORT || 4000)

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "salonbook-server",
  })
})

app.listen(port, () => {
  console.log(`SalonBook API is running on port ${port}`)
})