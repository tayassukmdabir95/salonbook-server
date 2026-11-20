import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const databaseName = process.env.MONGODB_DB_NAME

if (!uri || !databaseName) {
  throw new Error("MONGODB_URI and MONGODB_DB_NAME are required.")
}

export const mongoClient = new MongoClient(uri, {
  serverSelectionTimeoutMS: 10000,
})

export const db = mongoClient.db(databaseName)

export async function connectDatabase() {
  await mongoClient.connect()
  await db.command({ ping: 1 })
}